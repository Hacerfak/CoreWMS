using CoreWMS.Api.Features.Identity.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Data;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // 1. Aplica as migrações automaticamente no banco
        await context.Database.MigrateAsync();

        // 2. Injeta o Usuário Master
        if (!await context.Users.AnyAsync(u => u.IsMaster))
        {
            var masterPasswordHash = BCrypt.Net.BCrypt.HashPassword("Master@123");
            var masterUser = new User("Administrador Master", "master@corewms.com.br", masterPasswordHash, isMaster: true);
            context.Users.Add(masterUser);
            await context.SaveChangesAsync();
        }
    }
}