using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateFiscalDataOutbound : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CarrierStateRegistration",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DestinationCityCode",
                table: "OutboundOrders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DestinationComplement",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DestinationIeIndicator",
                table: "OutboundOrders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "DestinationNeighborhood",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationNumber",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationStateRegistration",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DestinationStreet",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FreightModality",
                table: "OutboundOrders",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CarrierStateRegistration",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationCityCode",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationComplement",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationIeIndicator",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationNeighborhood",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationNumber",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationStateRegistration",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "DestinationStreet",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "FreightModality",
                table: "OutboundOrders");
        }
    }
}
