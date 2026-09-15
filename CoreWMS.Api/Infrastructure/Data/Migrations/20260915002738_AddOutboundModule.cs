using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OutboundOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    DestinationCnpjCpf = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    DestinationName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DestinationCity = table.Column<string>(type: "text", nullable: false),
                    DestinationState = table.Column<string>(type: "text", nullable: false),
                    DestinationZipCode = table.Column<string>(type: "text", nullable: true),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpectedShipDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OutboundOrders_Locations_DockLocationId",
                        column: x => x.DockLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OutboundOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineNumber = table.Column<int>(type: "integer", nullable: false),
                    SkuCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    AllocatedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    PickedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    PackedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    UnitValue = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundOrderItems_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundOrderItems_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrderItems_OutboundOrderId",
                table: "OutboundOrderItems",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrderItems_ProductId",
                table: "OutboundOrderItems",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_CompanyId_OrderNumber",
                table: "OutboundOrders",
                columns: new[] { "CompanyId", "OrderNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_CustomerId",
                table: "OutboundOrders",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundOrders_DockLocationId",
                table: "OutboundOrders",
                column: "DockLocationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OutboundOrderItems");

            migrationBuilder.DropTable(
                name: "OutboundOrders");
        }
    }
}
