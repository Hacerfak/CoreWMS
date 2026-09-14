using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInboundModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InboundOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    IssuerCnpj = table.Column<string>(type: "character varying(14)", maxLength: 14, nullable: false),
                    IssuerName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: false),
                    RawXml = table.Column<string>(type: "text", nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InboundOrders_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundOrders_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InboundOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    LineNumber = table.Column<int>(type: "integer", nullable: false),
                    RawSkuCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RawBarcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RawDescription = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RawNcm = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    ExpectedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    ExpectedUnitValue = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    ExpectedBatch = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ExpectedManufactureDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpectedExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReceivedQuantity = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    LockedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboundOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_InboundOrders_InboundOrderId",
                        column: x => x.InboundOrderId,
                        principalTable: "InboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_Locations_DockLocationId",
                        column: x => x.DockLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InboundOrderItems_Products_ProductId",
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
                name: "IX_InboundOrderItems_InboundOrderId_Status",
                table: "InboundOrderItems",
                columns: new[] { "InboundOrderId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrderItems_ProductId",
                table: "InboundOrderItems",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrders_CompanyId_AccessKey",
                table: "InboundOrders",
                columns: new[] { "CompanyId", "AccessKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InboundOrders_CustomerId",
                table: "InboundOrders",
                column: "CustomerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InboundOrderItems");

            migrationBuilder.DropTable(
                name: "InboundOrders");
        }
    }
}
