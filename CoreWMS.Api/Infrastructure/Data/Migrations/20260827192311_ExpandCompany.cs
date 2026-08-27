using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class ExpandCompany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Cnae",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Iest",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoBase64",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "Companies",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Cnae",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "Iest",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "LogoBase64",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "Companies");
        }
    }
}
