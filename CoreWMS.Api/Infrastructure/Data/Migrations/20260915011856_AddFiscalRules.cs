using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFiscalRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FiscalOperationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    OperationType = table.Column<int>(type: "integer", nullable: false),
                    CfopStateInternal = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    CfopInterstate = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    CstCsosnIcms = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CstPisCofins = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    CstIpi = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    AdditionalNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SpecificCustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    SpecificDestinationState = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    SpecificNcmStart = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Priority = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalOperationRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FiscalOperationRules_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_FiscalOperationRules_Customers_SpecificCustomerId",
                        column: x => x.SpecificCustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OutboundVolume",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    VolumeLpn = table.Column<string>(type: "text", nullable: false),
                    GrossWeight = table.Column<decimal>(type: "numeric", nullable: false),
                    UsedStretchFilm = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundVolume", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundVolume_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundVolume_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_CompanyId",
                table: "FiscalOperationRules",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_SpecificCustomerId",
                table: "FiscalOperationRules",
                column: "SpecificCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundVolume_OutboundOrderId",
                table: "OutboundVolume",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundVolume_PackagingTypeId",
                table: "OutboundVolume",
                column: "PackagingTypeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FiscalOperationRules");

            migrationBuilder.DropTable(
                name: "OutboundVolume");
        }
    }
}
