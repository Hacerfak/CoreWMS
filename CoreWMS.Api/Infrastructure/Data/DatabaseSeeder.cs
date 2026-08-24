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
            adminRole.AddPermission(Permissions.Users.View);
            adminRole.AddPermission(Permissions.Users.Create);
            adminRole.AddPermission(Permissions.Users.Edit);
            adminRole.AddPermission(Permissions.Users.Delete);
            adminRole.AddPermission(Permissions.Users.Assign);
            adminRole.AddPermission(Permissions.Roles.View);
            adminRole.AddPermission(Permissions.Roles.Create);
            adminRole.AddPermission(Permissions.Roles.Edit);
            adminRole.AddPermission(Permissions.Roles.Delete);
            adminRole.AddPermission(Permissions.Companies.View);
            adminRole.AddPermission(Permissions.Companies.Create);
            adminRole.AddPermission(Permissions.Companies.Edit);
            adminRole.AddPermission(Permissions.Profile.UpdateSelf);
            adminRole.AddPermission(Permissions.Audit.View);
            adminRole.AddPermission(Permissions.Printing.Manage);
            adminRole.AddPermission(Permissions.Customers.View);
            adminRole.AddPermission(Permissions.Customers.Create);
            adminRole.AddPermission(Permissions.Customers.Edit);
            adminRole.AddPermission(Permissions.Customers.Delete);

            // --- GERENTE (CRUD Usuários + Vínculos) ---
            var gerenteRole = new Role("Gerente");
            gerenteRole.AddPermission(Permissions.Users.View);
            gerenteRole.AddPermission(Permissions.Users.Create);
            gerenteRole.AddPermission(Permissions.Users.Edit);
            gerenteRole.AddPermission(Permissions.Users.Delete);
            gerenteRole.AddPermission(Permissions.Users.Assign);
            gerenteRole.AddPermission(Permissions.Roles.View);
            gerenteRole.AddPermission(Permissions.Companies.View);
            gerenteRole.AddPermission(Permissions.Profile.UpdateSelf);
            gerenteRole.AddPermission(Permissions.Printing.Manage);
            gerenteRole.AddPermission(Permissions.Customers.View);
            gerenteRole.AddPermission(Permissions.Customers.Create);
            gerenteRole.AddPermission(Permissions.Customers.Edit);

            // --- OPERADOR (Apenas atualizar próprio cadastro) ---
            var operadorRole = new Role("Operador");
            operadorRole.AddPermission(Permissions.Profile.UpdateSelf);

            context.Roles.AddRange(adminRole, gerenteRole, operadorRole);
        }

        await context.SaveChangesAsync();
    }
}