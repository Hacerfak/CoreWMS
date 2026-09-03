using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUniqueEanToProduct : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PackagingTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PackagingTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PackagingTypes_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sku = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BaseUnit = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BaseBarcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Ncm = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Cest = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Origin = table.Column<int>(type: "integer", nullable: false),
                    MaxStacking = table.Column<int>(type: "integer", nullable: false),
                    RequireBatchControl = table.Column<bool>(type: "boolean", nullable: false),
                    RequireManufactureDate = table.Column<bool>(type: "boolean", nullable: false),
                    RequireExpirationDate = table.Column<bool>(type: "boolean", nullable: false),
                    RequireSerialControl = table.Column<bool>(type: "boolean", nullable: false),
                    PickingStrategy = table.Column<int>(type: "integer", nullable: false),
                    InboundShelfLifeToleranceDays = table.Column<int>(type: "integer", nullable: true),
                    OutboundShelfLifeToleranceDays = table.Column<int>(type: "integer", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Products_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Products_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProductPackagings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Barcode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ConversionFactor = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    IsDefaultInbound = table.Column<bool>(type: "boolean", nullable: false),
                    IsDefaultOutbound = table.Column<bool>(type: "boolean", nullable: false),
                    AllowFractionalPicking = table.Column<bool>(type: "boolean", nullable: false),
                    GrossWeight = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    NetWeight = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    LengthMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    WidthMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    HeightMm = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPackagings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPackagings_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProductPackagings_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PackagingTypes_CompanyId_Code",
                table: "PackagingTypes",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_Barcode",
                table: "ProductPackagings",
                column: "Barcode");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_PackagingTypeId",
                table: "ProductPackagings",
                column: "PackagingTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagings_ProductId_PackagingTypeId",
                table: "ProductPackagings",
                columns: new[] { "ProductId", "PackagingTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CompanyId_CustomerId_BaseBarcode",
                table: "Products",
                columns: new[] { "CompanyId", "CustomerId", "BaseBarcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CompanyId_CustomerId_Sku",
                table: "Products",
                columns: new[] { "CompanyId", "CustomerId", "Sku" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Products_CustomerId",
                table: "Products",
                column: "CustomerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductPackagings");

            migrationBuilder.DropTable(
                name: "PackagingTypes");

            migrationBuilder.DropTable(
                name: "Products");
        }
    }
}
