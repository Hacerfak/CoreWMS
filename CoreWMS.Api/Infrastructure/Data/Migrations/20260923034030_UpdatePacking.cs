using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdatePacking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDefaultInbound",
                table: "ProductPackagings");

            migrationBuilder.DropColumn(
                name: "IsDefaultOutbound",
                table: "ProductPackagings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDefaultInbound",
                table: "ProductPackagings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefaultOutbound",
                table: "ProductPackagings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
