using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundAllocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OutboundAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    IsPicked = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_HandlingUnits_HandlingUnitId",
                        column: x => x.HandlingUnitId,
                        principalTable: "HandlingUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_OutboundOrderItems_OutboundOrderItemId",
                        column: x => x.OutboundOrderItemId,
                        principalTable: "OutboundOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundAllocations_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_HandlingUnitId",
                table: "OutboundAllocations",
                column: "HandlingUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_OutboundOrderId",
                table: "OutboundAllocations",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundAllocations_OutboundOrderItemId",
                table: "OutboundAllocations",
                column: "OutboundOrderItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OutboundAllocations");
        }
    }
}
