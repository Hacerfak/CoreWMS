using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateLogisticsRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "RequireSerialControl",
                table: "Products",
                newName: "TracksSerial");

            migrationBuilder.RenameColumn(
                name: "RequireManufactureDate",
                table: "Products",
                newName: "TracksManufacture");

            migrationBuilder.RenameColumn(
                name: "RequireExpirationDate",
                table: "Products",
                newName: "TracksExpiration");

            migrationBuilder.RenameColumn(
                name: "RequireBatchControl",
                table: "Products",
                newName: "TracksBatch");

            migrationBuilder.RenameColumn(
                name: "RequireSerialControl",
                table: "Customers",
                newName: "TracksSerial");

            migrationBuilder.RenameColumn(
                name: "RequireExpirationControl",
                table: "Customers",
                newName: "TracksManufacture");

            migrationBuilder.RenameColumn(
                name: "RequireBatchControl",
                table: "Customers",
                newName: "TracksExpiration");

            migrationBuilder.AddColumn<int>(
                name: "PickingBaseDate",
                table: "Products",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "StrictBatch",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictExpiration",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictManufacture",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictSerial",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "DefaultPickingBaseDate",
                table: "Customers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "DefaultPickingStrategy",
                table: "Customers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "StrictBatch",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictExpiration",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictManufacture",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StrictSerial",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "TracksBatch",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PickingBaseDate",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StrictBatch",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StrictExpiration",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StrictManufacture",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "StrictSerial",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DefaultPickingBaseDate",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "DefaultPickingStrategy",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "StrictBatch",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "StrictExpiration",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "StrictManufacture",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "StrictSerial",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "TracksBatch",
                table: "Customers");

            migrationBuilder.RenameColumn(
                name: "TracksSerial",
                table: "Products",
                newName: "RequireSerialControl");

            migrationBuilder.RenameColumn(
                name: "TracksManufacture",
                table: "Products",
                newName: "RequireManufactureDate");

            migrationBuilder.RenameColumn(
                name: "TracksExpiration",
                table: "Products",
                newName: "RequireExpirationDate");

            migrationBuilder.RenameColumn(
                name: "TracksBatch",
                table: "Products",
                newName: "RequireBatchControl");

            migrationBuilder.RenameColumn(
                name: "TracksSerial",
                table: "Customers",
                newName: "RequireSerialControl");

            migrationBuilder.RenameColumn(
                name: "TracksManufacture",
                table: "Customers",
                newName: "RequireExpirationControl");

            migrationBuilder.RenameColumn(
                name: "TracksExpiration",
                table: "Customers",
                newName: "RequireBatchControl");
        }
    }
}
