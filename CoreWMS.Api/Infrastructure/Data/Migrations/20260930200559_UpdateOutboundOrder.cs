using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateOutboundOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdditionalNotes",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CarrierCnpjCpf",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CarrierName",
                table: "OutboundOrders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdditionalNotes",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "CarrierCnpjCpf",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "CarrierName",
                table: "OutboundOrders");
        }
    }
}
