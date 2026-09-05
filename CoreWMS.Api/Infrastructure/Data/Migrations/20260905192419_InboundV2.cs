using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class InboundV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasDamage",
                table: "InboundOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HasOverage",
                table: "InboundOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HasShortage",
                table: "InboundOrders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "AssignedUserId",
                table: "InboundOrderItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssignedUserName",
                table: "InboundOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DamagedQty",
                table: "InboundOrderItems",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<Guid>(
                name: "DockLocationId",
                table: "InboundOrderItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "GoodQty",
                table: "InboundOrderItems",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "MissingQty",
                table: "InboundOrderItems",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "OverageQty",
                table: "InboundOrderItems",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ServiceType",
                table: "InboundOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "InboundOrderItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "HandlingUnits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    LpnCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductPackagingId = table.Column<Guid>(type: "uuid", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    InboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    InboundOrderItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Batch = table.Column<string>(type: "text", nullable: true),
                    ManufactureDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Quality = table.Column<int>(type: "integer", nullable: false),
                    CurrentLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HandlingUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_InboundOrderItems_InboundOrderItemId",
                        column: x => x.InboundOrderItemId,
                        principalTable: "InboundOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_InboundOrders_InboundOrderId",
                        column: x => x.InboundOrderId,
                        principalTable: "InboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Locations_CurrentLocationId",
                        column: x => x.CurrentLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_ProductPackagings_ProductPackagingId",
                        column: x => x.ProductPackagingId,
                        principalTable: "ProductPackagings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HandlingUnits_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrderItems_DockLocationId",
                table: "InboundOrderItems",
                column: "DockLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_CompanyId_LpnCode",
                table: "HandlingUnits",
                columns: new[] { "CompanyId", "LpnCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_CurrentLocationId",
                table: "HandlingUnits",
                column: "CurrentLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_InboundOrderId",
                table: "HandlingUnits",
                column: "InboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_InboundOrderItemId",
                table: "HandlingUnits",
                column: "InboundOrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_ProductId",
                table: "HandlingUnits",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_HandlingUnits_ProductPackagingId",
                table: "HandlingUnits",
                column: "ProductPackagingId");

            migrationBuilder.AddForeignKey(
                name: "FK_InboundOrderItems_Locations_DockLocationId",
                table: "InboundOrderItems",
                column: "DockLocationId",
                principalTable: "Locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InboundOrderItems_Locations_DockLocationId",
                table: "InboundOrderItems");

            migrationBuilder.DropTable(
                name: "HandlingUnits");

            migrationBuilder.DropIndex(
                name: "IX_InboundOrderItems_DockLocationId",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "HasDamage",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "HasOverage",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "HasShortage",
                table: "InboundOrders");

            migrationBuilder.DropColumn(
                name: "AssignedUserId",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "AssignedUserName",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "DamagedQty",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "DockLocationId",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "GoodQty",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "MissingQty",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "OverageQty",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "ServiceType",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "InboundOrderItems");
        }
    }
}
