using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQualityModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QualityReasons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityReasons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QualityEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    HandlingUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    HoldReasonId = table.Column<Guid>(type: "uuid", nullable: false),
                    HoldNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ReleaseReasonId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReleaseNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityEvents_HandlingUnits_HandlingUnitId",
                        column: x => x.HandlingUnitId,
                        principalTable: "HandlingUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_Locations_OriginalLocationId",
                        column: x => x.OriginalLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_QualityReasons_HoldReasonId",
                        column: x => x.HoldReasonId,
                        principalTable: "QualityReasons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QualityEvents_QualityReasons_ReleaseReasonId",
                        column: x => x.ReleaseReasonId,
                        principalTable: "QualityReasons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "QualityEventImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QualityEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Base64Data = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QualityEventImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QualityEventImages_QualityEvents_QualityEventId",
                        column: x => x.QualityEventId,
                        principalTable: "QualityEvents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QualityEventImages_QualityEventId",
                table: "QualityEventImages",
                column: "QualityEventId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_CompanyId_IsResolved",
                table: "QualityEvents",
                columns: new[] { "CompanyId", "IsResolved" });

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_HandlingUnitId",
                table: "QualityEvents",
                column: "HandlingUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_HoldReasonId",
                table: "QualityEvents",
                column: "HoldReasonId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_OriginalLocationId",
                table: "QualityEvents",
                column: "OriginalLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityEvents_ReleaseReasonId",
                table: "QualityEvents",
                column: "ReleaseReasonId");

            migrationBuilder.CreateIndex(
                name: "IX_QualityReasons_CompanyId_Code",
                table: "QualityReasons",
                columns: new[] { "CompanyId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QualityEventImages");

            migrationBuilder.DropTable(
                name: "QualityEvents");

            migrationBuilder.DropTable(
                name: "QualityReasons");
        }
    }
}
