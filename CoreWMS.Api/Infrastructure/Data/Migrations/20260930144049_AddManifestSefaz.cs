using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddManifestSefaz : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LastSefazManifestType",
                table: "InboundOrders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SefazManifestDate",
                table: "InboundOrders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SefazManifestJustification",
                table: "InboundOrders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SefazManifestProtocol",
                table: "InboundOrders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastSefazManifestType",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "SefazManifestDate",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "SefazManifestJustification",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "SefazManifestProtocol",
                table: "InboundOrders");
        }
    }
}
