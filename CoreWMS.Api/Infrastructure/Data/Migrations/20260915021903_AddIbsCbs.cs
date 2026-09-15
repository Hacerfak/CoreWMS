using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIbsCbs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AliqCbs",
                table: "FiscalOperationRules",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqIbs",
                table: "FiscalOperationRules",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "CstCbs",
                table: "FiscalOperationRules",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CstIbs",
                table: "FiscalOperationRules",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AliqCbs",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqIbs",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "CstCbs",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "CstIbs",
                table: "FiscalOperationRules");
        }
    }
}
