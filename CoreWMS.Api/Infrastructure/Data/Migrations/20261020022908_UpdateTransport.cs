using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateTransport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CarrierAddress",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CarrierCity",
                table: "OutboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CarrierState",
                table: "OutboundOrders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CarrierAddress",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "CarrierCity",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "CarrierState",
                table: "OutboundOrders");
        }
    }
}
