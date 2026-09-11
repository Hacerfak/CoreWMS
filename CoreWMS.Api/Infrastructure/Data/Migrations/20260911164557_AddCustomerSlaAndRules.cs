using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerSlaAndRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "AutoApproveReceiving",
                table: "Customers",
                newName: "ReturnInvoicePerReferencedInvoice");

            migrationBuilder.RenameColumn(
                name: "AllowNegativeStock",
                table: "Customers",
                newName: "RequiresBlindOutbound");

            migrationBuilder.AddColumn<int>(
                name: "IeIndicator",
                table: "Customers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MaxDailyInboundOrders",
                table: "Customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxDailyOutboundOrders",
                table: "Customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxStockVolume",
                table: "Customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinStockVolume",
                table: "Customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresBlindInbound",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IeIndicator",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "MaxDailyInboundOrders",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "MaxDailyOutboundOrders",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "MaxStockVolume",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "MinStockVolume",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "RequiresBlindInbound",
                table: "Customers");

            migrationBuilder.RenameColumn(
                name: "ReturnInvoicePerReferencedInvoice",
                table: "Customers",
                newName: "AutoApproveReceiving");

            migrationBuilder.RenameColumn(
                name: "RequiresBlindOutbound",
                table: "Customers",
                newName: "AllowNegativeStock");
        }
    }
}
