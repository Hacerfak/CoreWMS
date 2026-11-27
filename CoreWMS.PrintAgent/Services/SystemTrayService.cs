using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Hosting;

#if WINDOWS
using System.Drawing;
using System.Windows.Forms;
#endif

namespace CoreWMS.PrintAgent.Services;

public class SystemTrayService : BackgroundService
{
    private readonly AgentConfigManager _configMgr;
    private readonly IHostApplicationLifetime _appLifetime;
    private readonly ILogger<SystemTrayService> _logger;
    private Process? _linuxTrayProcess;

    public SystemTrayService(
        AgentConfigManager configMgr,
        IHostApplicationLifetime appLifetime,
        ILogger<SystemTrayService> logger)
    {
        _configMgr = configMgr;
        _appLifetime = appLifetime;
        _logger = logger;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            StartWindowsTray();
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            StartLinuxTray();
        }

        return Task.CompletedTask;
    }

    private void StartWindowsTray()
    {
#if WINDOWS
        var thread = new Thread(() =>
        {
            try
            {
                using var bitmap = new Bitmap(16, 16);
                using (var g = Graphics.FromImage(bitmap))
                {
                    g.Clear(Color.Transparent);
                    g.FillRectangle(Brushes.DodgerBlue, 1, 1, 14, 14);
                    g.DrawRectangle(Pens.White, 3, 3, 10, 10);
                }

                using var notifyIcon = new NotifyIcon
                {
                    Icon = Icon.FromHandle(bitmap.GetHicon()),
                    Text = "CoreWMS Print Agent",
                    Visible = true
                };

                var contextMenu = new ContextMenuStrip();
                contextMenu.Items.Add("🌐 Abrir Dashboard", null, (s, e) => OpenUrl($"http://localhost:{_configMgr.Config.LocalPort}"));
                contextMenu.Items.Add("⚙️ Configurações", null, (s, e) => OpenUrl($"http://localhost:{_configMgr.Config.LocalPort}/config"));
                contextMenu.Items.Add(new ToolStripSeparator());
                contextMenu.Items.Add("🛑 Encerrar Agente", null, (s, e) =>
                {
                    notifyIcon.Visible = false;
                    _appLifetime.StopApplication();
                });

                notifyIcon.ContextMenuStrip = contextMenu;
                notifyIcon.DoubleClick += (s, e) => OpenUrl($"http://localhost:{_configMgr.Config.LocalPort}");

                Application.Run();
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Não foi possível carregar o System Tray do Windows: {Message}", ex.Message);
            }
        });

        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
#endif
    }

    private void StartLinuxTray()
    {
        var port = _configMgr.Config.LocalPort;
        var pythonScript = $@"
import sys, webbrowser
try:
    import gi
    gi.require_version('Gtk', '3.0')
    from gi.repository import Gtk, Gio

    use_gio_menu = False
    try:
        gi.require_version('AyatanaAppIndicatorGlib', '1.0')
        from gi.repository import AyatanaAppIndicatorGlib as AppIndicator
        use_gio_menu = True
    except Exception:
        try:
            gi.require_version('AyatanaAppIndicator3', '0.1')
            from gi.repository import AyatanaAppIndicator3 as AppIndicator
        except Exception:
            gi.require_version('AppIndicator3', '0.1')
            from gi.repository import AppIndicator3 as AppIndicator
except Exception as e:
    sys.stderr.write(f'Erro de dependências no Python Tray: {{e}}\n')
    sys.exit(1)

def open_dash(*args): webbrowser.open('http://localhost:{port}')
def open_cfg(*args): webbrowser.open('http://localhost:{port}/config')
def quit_agent(*args):
    import urllib.request
    try:
        req = urllib.request.Request('http://localhost:{port}/api/shutdown', method='POST')
        urllib.request.urlopen(req)
    except: pass
    if use_gio_menu and 'app' in globals():
        app.quit()
    else:
        Gtk.main_quit()

indicator = AppIndicator.Indicator.new(
    'corewms-print-agent',
    'printer-symbolic',
    AppIndicator.IndicatorCategory.APPLICATION_STATUS
)
indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)

if use_gio_menu:
        # Testa se o ícone existe no tema GTK; se não, usa fallback garantido
        icon_theme = Gtk.IconTheme.get_default()
        icon_name = 'printer-symbolic' if icon_theme.has_icon('printer-symbolic') else 'dialog-information'

        indicator = AppIndicator.Indicator.new(
            'corewms-print-agent',
            icon_name,
            AppIndicator.IndicatorCategory.APPLICATION_STATUS
        )
        indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)

        app = Gtk.Application(
            application_id='com.corewms.printagent.tray.menu',
            flags=Gio.ApplicationFlags.FLAGS_NONE
        )

        def on_activate(a):
            a.hold()
            for name, cb in [
                ('open-dash', open_dash),
                ('open-cfg', open_cfg),
                ('quit-agent', quit_agent),
            ]:
                act = Gio.SimpleAction.new(name, None)
                act.connect('activate', cb)
                a.add_action(act)

            gmenu = Gio.Menu()
            gmenu.append('🌐 Abrir Dashboard', 'app.open-dash')
            gmenu.append('⚙️ Configurações', 'app.open-cfg')
            gmenu.append('🛑 Encerrar Agente', 'app.quit-agent')

            indicator.set_menu(gmenu)

        app.connect('activate', on_activate)
        app.run(None)
else:
    menu = Gtk.Menu()

    item_dash = Gtk.MenuItem(label='🌐 Abrir Dashboard')
    item_dash.connect('activate', open_dash)
    menu.append(item_dash)

    item_cfg = Gtk.MenuItem(label='⚙️ Configurações')
    item_cfg.connect('activate', open_cfg)
    menu.append(item_cfg)

    menu.append(Gtk.SeparatorMenuItem())

    item_quit = Gtk.MenuItem(label='🛑 Encerrar Agente')
    item_quit.connect('activate', quit_agent)
    menu.append(item_quit)

    menu.show_all()
    indicator.set_menu(menu)
    Gtk.main()
";

        try
        {
            var scriptPath = Path.Combine(Path.GetTempPath(), "corewms_tray.py");
            File.WriteAllText(scriptPath, pythonScript);

            var psi = new ProcessStartInfo
            {
                FileName = "python3",
                Arguments = $"\"{scriptPath}\"",
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            _linuxTrayProcess = Process.Start(psi);

            // Escuta em background se o script de tray disparar algum erro de biblioteca
            Task.Run(async () =>
            {
                if (_linuxTrayProcess != null)
                {
                    var err = await _linuxTrayProcess.StandardError.ReadToEndAsync();
                    if (!string.IsNullOrWhiteSpace(err))
                    {
                        _logger.LogWarning("[System Tray Linux] {Error}", err.Trim());
                    }
                }
            });

            _logger.LogInformation("System Tray para Linux GNOME/KDE iniciado com suporte Glib dinâmico.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Não foi possível iniciar o System Tray Linux: {Message}", ex.Message);
        }
    }

    public static void OpenUrl(string url)
    {
        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                Process.Start("xdg-open", url);
        }
        catch { }
    }

    public override void Dispose()
    {
        try
        {
            _linuxTrayProcess?.Kill();
        }
        catch { }
        base.Dispose();
    }
}