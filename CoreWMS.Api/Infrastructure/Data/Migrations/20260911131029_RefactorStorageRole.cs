using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class RefactorStorageRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsVirtual",
                table: "StorageTypes");

            migrationBuilder.AddColumn<int>(
                name: "Role",
                table: "StorageTypes",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Role",
                table: "StorageTypes");

            migrationBuilder.AddColumn<bool>(
                name: "IsVirtual",
                table: "StorageTypes",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
