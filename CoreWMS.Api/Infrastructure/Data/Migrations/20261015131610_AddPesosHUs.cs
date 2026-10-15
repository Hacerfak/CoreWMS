using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPesosHUs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "GrossWeight",
                table: "Products",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "NetWeight",
                table: "Products",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "InboundUnitValue",
                table: "OutboundOrderItems",
                type: "numeric(28,10)",
                precision: 28,
                scale: 10,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitGrossWeight",
                table: "InboundOrderItems",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitNetWeight",
                table: "InboundOrderItems",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitGrossWeight",
                table: "HandlingUnits",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitNetWeight",
                table: "HandlingUnits",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GrossWeight",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "NetWeight",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "InboundUnitValue",
                table: "OutboundOrderItems");

            migrationBuilder.DropColumn(
                name: "UnitGrossWeight",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "UnitNetWeight",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "UnitGrossWeight",
                table: "HandlingUnits");

            migrationBuilder.DropColumn(
                name: "UnitNetWeight",
                table: "HandlingUnits");
        }
    }
}
