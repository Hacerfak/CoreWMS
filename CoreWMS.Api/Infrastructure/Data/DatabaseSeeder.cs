using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Data;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        await context.Database.MigrateAsync();

        // 1. Usuário Master
        if (!await context.Users.AnyAsync(u => u.IsMaster))
        {
            var masterPasswordHash = BCrypt.Net.BCrypt.HashPassword("Master@123");
            var masterUser = new User("Administrador Master", "master@corewms.com.br", masterPasswordHash, isMaster: true);
            context.Users.Add(masterUser);
        }

        // 2. Roles e Suas Permissões Padrão
        if (!await context.Roles.AnyAsync())
        {
            // --- ADMINISTRADOR (Tudo exceto excluir empresa) ---
            var adminRole = new Role("Administrador");
            adminRole.AddPermission(Permissions.Users.Manage);
            adminRole.AddPermission(Permissions.Roles.Manage);
            adminRole.AddPermission(Permissions.Companies.Manage);
            adminRole.AddPermission(Permissions.Profile.UpdateSelf);
            adminRole.AddPermission(Permissions.Audit.View);
            adminRole.AddPermission(Permissions.Printing.Manage);
            adminRole.AddPermission(Permissions.Customers.View);
            adminRole.AddPermission(Permissions.Customers.Create);
            adminRole.AddPermission(Permissions.Customers.Edit);
            adminRole.AddPermission(Permissions.Customers.Delete);
            adminRole.AddPermission(Permissions.Yard.View);
            adminRole.AddPermission(Permissions.Yard.Schedule);
            adminRole.AddPermission(Permissions.Yard.Operate);
            adminRole.AddPermission(Permissions.Yard.Manage);
            adminRole.AddPermission(Permissions.Outbound.View);
            adminRole.AddPermission(Permissions.Outbound.Create);
            adminRole.AddPermission(Permissions.Outbound.Import);
            adminRole.AddPermission(Permissions.Outbound.Edit);
            adminRole.AddPermission(Permissions.Outbound.Cancel);
            adminRole.AddPermission(Permissions.Outbound.Allocate);
            adminRole.AddPermission(Permissions.Outbound.Pick);
            adminRole.AddPermission(Permissions.Outbound.Pack);
            adminRole.AddPermission(Permissions.Outbound.Check);
            adminRole.AddPermission(Permissions.Outbound.Ship);
            adminRole.AddPermission(Permissions.Outbound.Manage);
            adminRole.AddPermission(Permissions.Inbound.View);
            adminRole.AddPermission(Permissions.Inbound.Import);
            adminRole.AddPermission(Permissions.Inbound.Manifest);
            adminRole.AddPermission(Permissions.Inbound.Review);
            adminRole.AddPermission(Permissions.Inbound.Cancel);
            adminRole.AddPermission(Permissions.Inbound.Receive);
            adminRole.AddPermission(Permissions.Inbound.Manage);
            adminRole.AddPermission(Permissions.Inventory.View);
            adminRole.AddPermission(Permissions.Inventory.Export);
            adminRole.AddPermission(Permissions.Inventory.Move);
            adminRole.AddPermission(Permissions.Inventory.Split);
            adminRole.AddPermission(Permissions.Inventory.Merge);
            adminRole.AddPermission(Permissions.Inventory.EditTraceability);
            adminRole.AddPermission(Permissions.Inventory.Manage);
            adminRole.AddPermission(Permissions.Quality.View);
            adminRole.AddPermission(Permissions.Quality.Hold);
            adminRole.AddPermission(Permissions.Quality.Release);
            adminRole.AddPermission(Permissions.Quality.Manage);
            adminRole.AddPermission(Permissions.CycleCount.View);
            adminRole.AddPermission(Permissions.CycleCount.Create);
            adminRole.AddPermission(Permissions.CycleCount.Export);
            adminRole.AddPermission(Permissions.CycleCount.Count);
            adminRole.AddPermission(Permissions.CycleCount.Manage);
            adminRole.AddPermission(Permissions.Billing.View);
            adminRole.AddPermission(Permissions.Billing.Export);
            adminRole.AddPermission(Permissions.Billing.Manage);
            adminRole.AddPermission(Permissions.Fiscal.View);
            adminRole.AddPermission(Permissions.Fiscal.Emit);
            adminRole.AddPermission(Permissions.Fiscal.Manage);
            adminRole.AddPermission(Permissions.Products.View);
            adminRole.AddPermission(Permissions.Products.Create);
            adminRole.AddPermission(Permissions.Products.Edit);
            adminRole.AddPermission(Permissions.Products.Delete);
            adminRole.AddPermission(Permissions.Customers.View);
            adminRole.AddPermission(Permissions.Customers.Create);
            adminRole.AddPermission(Permissions.Customers.Edit);
            adminRole.AddPermission(Permissions.Customers.Delete);

            // --- GERENTE (CRUD Usuários + Vínculos) ---
            var gerenteRole = new Role("Gerente");
            gerenteRole.AddPermission(Permissions.Users.Manage);
            gerenteRole.AddPermission(Permissions.Profile.UpdateSelf);
            gerenteRole.AddPermission(Permissions.Printing.Manage);
            gerenteRole.AddPermission(Permissions.Customers.View);
            gerenteRole.AddPermission(Permissions.Customers.Create);
            gerenteRole.AddPermission(Permissions.Customers.Edit);
            gerenteRole.AddPermission(Permissions.Yard.View);
            gerenteRole.AddPermission(Permissions.Yard.Schedule);
            gerenteRole.AddPermission(Permissions.Yard.Operate);
            gerenteRole.AddPermission(Permissions.Yard.Manage);
            gerenteRole.AddPermission(Permissions.Outbound.View);
            gerenteRole.AddPermission(Permissions.Outbound.Create);
            gerenteRole.AddPermission(Permissions.Outbound.Import);
            gerenteRole.AddPermission(Permissions.Outbound.Edit);
            gerenteRole.AddPermission(Permissions.Outbound.Cancel);
            gerenteRole.AddPermission(Permissions.Outbound.Allocate);
            gerenteRole.AddPermission(Permissions.Outbound.Pick);
            gerenteRole.AddPermission(Permissions.Outbound.Pack);
            gerenteRole.AddPermission(Permissions.Outbound.Check);
            gerenteRole.AddPermission(Permissions.Outbound.Ship);
            gerenteRole.AddPermission(Permissions.Outbound.Manage);
            gerenteRole.AddPermission(Permissions.Inbound.View);
            gerenteRole.AddPermission(Permissions.Inbound.Import);
            gerenteRole.AddPermission(Permissions.Inbound.Manifest);
            gerenteRole.AddPermission(Permissions.Inbound.Review);
            gerenteRole.AddPermission(Permissions.Inbound.Cancel);
            gerenteRole.AddPermission(Permissions.Inbound.Receive);
            gerenteRole.AddPermission(Permissions.Inbound.Manage);
            gerenteRole.AddPermission(Permissions.Inventory.View);
            gerenteRole.AddPermission(Permissions.Inventory.Export);
            gerenteRole.AddPermission(Permissions.Inventory.Move);
            gerenteRole.AddPermission(Permissions.Inventory.Split);
            gerenteRole.AddPermission(Permissions.Inventory.Merge);
            gerenteRole.AddPermission(Permissions.Inventory.EditTraceability);
            gerenteRole.AddPermission(Permissions.Inventory.Manage);
            gerenteRole.AddPermission(Permissions.Quality.View);
            gerenteRole.AddPermission(Permissions.Quality.Hold);
            gerenteRole.AddPermission(Permissions.Quality.Release);
            gerenteRole.AddPermission(Permissions.Quality.Manage);
            gerenteRole.AddPermission(Permissions.CycleCount.View);
            gerenteRole.AddPermission(Permissions.CycleCount.Create);
            gerenteRole.AddPermission(Permissions.CycleCount.Export);
            gerenteRole.AddPermission(Permissions.CycleCount.Count);
            gerenteRole.AddPermission(Permissions.CycleCount.Manage);
            gerenteRole.AddPermission(Permissions.Fiscal.View);
            gerenteRole.AddPermission(Permissions.Fiscal.Emit);
            gerenteRole.AddPermission(Permissions.Products.View);
            gerenteRole.AddPermission(Permissions.Products.Create);
            gerenteRole.AddPermission(Permissions.Products.Edit);
            gerenteRole.AddPermission(Permissions.Customers.View);
            gerenteRole.AddPermission(Permissions.Customers.Create);
            gerenteRole.AddPermission(Permissions.Customers.Edit);

            // --- OPERADOR (Apenas atualizar próprio cadastro) ---
            var operadorRole = new Role("Operador");
            operadorRole.AddPermission(Permissions.Profile.UpdateSelf);
            operadorRole.AddPermission(Permissions.Yard.View);
            operadorRole.AddPermission(Permissions.Yard.Operate);
            operadorRole.AddPermission(Permissions.Outbound.View);
            operadorRole.AddPermission(Permissions.Outbound.Pick);
            operadorRole.AddPermission(Permissions.Outbound.Pack);
            operadorRole.AddPermission(Permissions.Outbound.Check);
            operadorRole.AddPermission(Permissions.Inbound.View);
            operadorRole.AddPermission(Permissions.Inbound.Receive);
            operadorRole.AddPermission(Permissions.Inventory.View);
            operadorRole.AddPermission(Permissions.Inventory.Move);
            operadorRole.AddPermission(Permissions.Inventory.Split);
            operadorRole.AddPermission(Permissions.Inventory.Merge);
            operadorRole.AddPermission(Permissions.Quality.View);
            operadorRole.AddPermission(Permissions.Quality.Hold);
            operadorRole.AddPermission(Permissions.CycleCount.Count);

            context.Roles.AddRange(adminRole, gerenteRole, operadorRole);
        }

        await context.SaveChangesAsync();
    }
}