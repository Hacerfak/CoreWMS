using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class CheckOutOutbound : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CheckedAt",
                table: "OutboundVolumes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckedByName",
                table: "OutboundVolumes",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CheckedByUserId",
                table: "OutboundVolumes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsAutoPacked",
                table: "OutboundVolumes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsChecked",
                table: "OutboundVolumes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PackedAt",
                table: "OutboundVolumes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PackedByName",
                table: "OutboundVolumes",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PackedByUserId",
                table: "OutboundVolumes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CheckedQuantity",
                table: "OutboundOrderItems",
                type: "numeric(28,10)",
                precision: 28,
                scale: 10,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "CheckedAt",
                table: "OutboundAllocations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckedByName",
                table: "OutboundAllocations",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CheckedByUserId",
                table: "OutboundAllocations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsChecked",
                table: "OutboundAllocations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "PickedAt",
                table: "OutboundAllocations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PickedByName",
                table: "OutboundAllocations",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PickedByUserId",
                table: "OutboundAllocations",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OutboundCheckLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    OutboundVolumeId = table.Column<Guid>(type: "uuid", nullable: true),
                    ScannedCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CodeType = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    CheckedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CheckedByName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundCheckLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundCheckLogs_OutboundOrderItems_OutboundOrderItemId",
                        column: x => x.OutboundOrderItemId,
                        principalTable: "OutboundOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundCheckLogs_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundCheckLogs_OutboundOrderId_CreatedAt",
                table: "OutboundCheckLogs",
                columns: new[] { "OutboundOrderId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundCheckLogs_OutboundOrderId_ScannedCode",
                table: "OutboundCheckLogs",
                columns: new[] { "OutboundOrderId", "ScannedCode" });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundCheckLogs_OutboundOrderItemId",
                table: "OutboundCheckLogs",
                column: "OutboundOrderItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OutboundCheckLogs");

            migrationBuilder.DropColumn(
                name: "CheckedAt",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "CheckedByName",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "CheckedByUserId",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "IsAutoPacked",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "IsChecked",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "PackedAt",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "PackedByName",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "PackedByUserId",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "CheckedQuantity",
                table: "OutboundOrderItems");

            migrationBuilder.DropColumn(
                name: "CheckedAt",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "CheckedByName",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "CheckedByUserId",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "IsChecked",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "PickedAt",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "PickedByName",
                table: "OutboundAllocations");

            migrationBuilder.DropColumn(
                name: "PickedByUserId",
                table: "OutboundAllocations");
        }
    }
}
