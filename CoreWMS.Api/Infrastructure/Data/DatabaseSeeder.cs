using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Topology.Enums;
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
            // --- ADMINISTRADOR ---
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

            // Novos Módulos
            adminRole.AddPermission(Permissions.Topology.Manage);
            adminRole.AddPermission(Permissions.Products.View);
            adminRole.AddPermission(Permissions.Products.Create);
            adminRole.AddPermission(Permissions.Products.Edit);
            adminRole.AddPermission(Permissions.Products.Delete);

            adminRole.AddPermission(Permissions.Inbound.View);
            adminRole.AddPermission(Permissions.Inbound.ViewFinancials);
            adminRole.AddPermission(Permissions.Inbound.ViewExpectedQty);
            adminRole.AddPermission(Permissions.Inbound.UploadXml);
            adminRole.AddPermission(Permissions.Inbound.ReviewProducts);
            adminRole.AddPermission(Permissions.Inbound.AssignDock);
            adminRole.AddPermission(Permissions.Inbound.ExecuteChecking);
            adminRole.AddPermission(Permissions.Inbound.ExecutePutaway);
            adminRole.AddPermission(Permissions.Inbound.ManageDivergences);
            adminRole.AddPermission(Permissions.Inbound.ForceFinish);
            adminRole.AddPermission(Permissions.Inbound.Cancel);

            // --- GERENTE (Focado em Visão e Gestão Operacional) ---
            var gerenteRole = new Role("Gerente");
            gerenteRole.AddPermission(Permissions.Users.Manage);
            gerenteRole.AddPermission(Permissions.Profile.UpdateSelf);
            gerenteRole.AddPermission(Permissions.Printing.Manage);
            gerenteRole.AddPermission(Permissions.Customers.View);
            gerenteRole.AddPermission(Permissions.Customers.Create);
            gerenteRole.AddPermission(Permissions.Customers.Edit);

            gerenteRole.AddPermission(Permissions.Topology.Manage);
            gerenteRole.AddPermission(Permissions.Products.View);
            gerenteRole.AddPermission(Permissions.Products.Create);
            gerenteRole.AddPermission(Permissions.Products.Edit);

            gerenteRole.AddPermission(Permissions.Inbound.View);
            gerenteRole.AddPermission(Permissions.Inbound.ViewExpectedQty);
            gerenteRole.AddPermission(Permissions.Inbound.UploadXml);
            gerenteRole.AddPermission(Permissions.Inbound.ReviewProducts);
            gerenteRole.AddPermission(Permissions.Inbound.AssignDock);
            gerenteRole.AddPermission(Permissions.Inbound.ManageDivergences);

            // --- OPERADOR (Focado puramente no Coletor RF) ---
            var operadorRole = new Role("Operador");
            operadorRole.AddPermission(Permissions.Profile.UpdateSelf);
            operadorRole.AddPermission(Permissions.Inbound.View);
            operadorRole.AddPermission(Permissions.Inbound.ExecuteChecking);
            operadorRole.AddPermission(Permissions.Inbound.ExecutePutaway);

            context.Roles.AddRange(adminRole, gerenteRole, operadorRole);
            await context.SaveChangesAsync();
        }

        if (!await context.StorageTypes.AnyAsync())
        {
            // Tipos de Armazenamento
            var stDoca = new StorageType("Doca de Recebimento", isVirtual: true, allowMixedProducts: true, allowMixedBatches: true, StorageCapacityStrategy.DynamicStacking);
            var stBlocado = new StorageType("Blocado de Chão", isVirtual: false, allowMixedProducts: false, allowMixedBatches: false, StorageCapacityStrategy.DynamicStacking);
            var stPortaPallet = new StorageType("Porta-Pallets Padrão", isVirtual: false, allowMixedProducts: false, allowMixedBatches: false, StorageCapacityStrategy.Unitary);

            context.StorageTypes.AddRange(stDoca, stBlocado, stPortaPallet);
            await context.SaveChangesAsync();

            // Pavilhão, Zonas e Endereços
            if (!await context.Warehouses.AnyAsync())
            {
                var p1 = new Warehouse("P1", "Pavilhão 1", clearanceHeight: 12.0m);
                context.Warehouses.Add(p1);
                await context.SaveChangesAsync();

                var zDoca = new Zone(p1.Id, "DOCA", "Docas de Carga e Descarga");
                var zBloco = new Zone(p1.Id, "BLC", "Blocado Principal");
                context.Zones.AddRange(zDoca, zBloco);
                await context.SaveChangesAsync();

                var locDoca = new Location(zDoca.Id, stDoca.Id, "01", $"{p1.Code}-{zDoca.Code}-01", baseCapacity: 999);
                var locBloco = new Location(zBloco.Id, stBlocado.Id, "01", $"{p1.Code}-{zBloco.Code}-01", baseCapacity: 10);
                context.Locations.AddRange(locDoca, locBloco);

                await context.SaveChangesAsync();
            }
        }
    }
}