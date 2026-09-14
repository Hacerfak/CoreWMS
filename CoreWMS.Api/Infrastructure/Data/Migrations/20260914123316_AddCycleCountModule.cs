using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCycleCountModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CycleCountPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Batch = table.Column<string>(type: "text", nullable: true),
                    ZoneId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CycleCountPlans_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountPlans_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountPlans_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountPlans_Zones_ZoneId",
                        column: x => x.ZoneId,
                        principalTable: "Zones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CycleCountTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CycleCountPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpectedQuantity = table.Column<int>(type: "integer", nullable: false),
                    CurrentRound = table.Column<int>(type: "integer", nullable: false),
                    IsStrictLpnMode = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_CycleCountPlans_CycleCountPlanId",
                        column: x => x.CycleCountPlanId,
                        principalTable: "CycleCountPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CycleCountTasks_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CycleCountRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CycleCountTaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    InspectorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CountedQuantity = table.Column<int>(type: "integer", nullable: true),
                    ScannedHandlingUnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CycleCountRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CycleCountRecords_CycleCountTasks_CycleCountTaskId",
                        column: x => x.CycleCountTaskId,
                        principalTable: "CycleCountTasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CycleCountRecords_HandlingUnits_ScannedHandlingUnitId",
                        column: x => x.ScannedHandlingUnitId,
                        principalTable: "HandlingUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountPlans_CustomerId",
                table: "CycleCountPlans",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountPlans_LocationId",
                table: "CycleCountPlans",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountPlans_ProductId",
                table: "CycleCountPlans",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountPlans_ZoneId",
                table: "CycleCountPlans",
                column: "ZoneId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountRecords_CycleCountTaskId",
                table: "CycleCountRecords",
                column: "CycleCountTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountRecords_ScannedHandlingUnitId",
                table: "CycleCountRecords",
                column: "ScannedHandlingUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_CycleCountPlanId",
                table: "CycleCountTasks",
                column: "CycleCountPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_LocationId",
                table: "CycleCountTasks",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_CycleCountTasks_ProductId",
                table: "CycleCountTasks",
                column: "ProductId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CycleCountRecords");

            migrationBuilder.DropTable(
                name: "CycleCountTasks");

            migrationBuilder.DropTable(
                name: "CycleCountPlans");
        }
    }
}
