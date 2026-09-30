using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateCycleTasksAndPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CycleCountPlans_Customers_CustomerId",
                table: "CycleCountPlans");

            migrationBuilder.DropForeignKey(
                name: "FK_CycleCountPlans_Locations_LocationId",
                table: "CycleCountPlans");

            migrationBuilder.DropForeignKey(
                name: "FK_CycleCountPlans_Products_ProductId",
                table: "CycleCountPlans");

            migrationBuilder.DropForeignKey(
                name: "FK_CycleCountPlans_Zones_ZoneId",
                table: "CycleCountPlans");

            migrationBuilder.DropTable(
                name: "CycleCountRecords");

            migrationBuilder.DropIndex(
                name: "IX_CycleCountPlans_CustomerId",
                table: "CycleCountPlans");

            migrationBuilder.DropIndex(
                name: "IX_CycleCountPlans_LocationId",
                table: "CycleCountPlans");

            migrationBuilder.DropIndex(
                name: "IX_CycleCountPlans_ProductId",
                table: "CycleCountPlans");

            migrationBuilder.DropIndex(
                name: "IX_CycleCountPlans_ZoneId",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "LocationId",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "ProductId",
                table: "CycleCountPlans");

            migrationBuilder.RenameColumn(
                name: "FiscalDocumentId",
                table: "CycleCountTasks",
                newName: "UserRound3");

            migrationBuilder.RenameColumn(
                name: "ZoneId",
                table: "CycleCountPlans",
                newName: "AssignedUserId");

            migrationBuilder.AddColumn<Guid>(
                name: "AssignedUserId",
                table: "CycleCountTasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CountRound1",
                table: "CycleCountTasks",
                type: "numeric(18,10)",
                precision: 18,
                scale: 10,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CountRound2",
                table: "CycleCountTasks",
                type: "numeric(18,10)",
                precision: 18,
                scale: 10,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CountRound3",
                table: "CycleCountTasks",
                type: "numeric(18,10)",
                precision: 18,
                scale: 10,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserRound1",
                table: "CycleCountTasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserRound2",
                table: "CycleCountTasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "BlockMovements",
                table: "CycleCountPlans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<List<Guid>>(
                name: "CustomerIds",
                table: "CycleCountPlans",
                type: "uuid[]",
                nullable: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnableAdjustments",
                table: "CycleCountPlans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<List<Guid>>(
                name: "LocationIds",
                table: "CycleCountPlans",
                type: "uuid[]",
                nullable: false);

            migrationBuilder.AddColumn<int>(
                name: "MaxRounds",
                table: "CycleCountPlans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<List<Guid>>(
                name: "ProductIds",
                table: "CycleCountPlans",
                type: "uuid[]",
                nullable: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssignedUserId",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "CountRound1",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "CountRound2",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "CountRound3",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "UserRound1",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "UserRound2",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "BlockMovements",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "CustomerIds",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "EnableAdjustments",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "LocationIds",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "MaxRounds",
                table: "CycleCountPlans");

            migrationBuilder.DropColumn(
                name: "ProductIds",
                table: "CycleCountPlans");

            migrationBuilder.RenameColumn(
                name: "UserRound3",
                table: "CycleCountTasks",
                newName: "FiscalDocumentId");

            migrationBuilder.RenameColumn(
                name: "AssignedUserId",
                table: "CycleCountPlans",
                newName: "ZoneId");

            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "CycleCountPlans",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LocationId",
                table: "CycleCountPlans",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductId",
                table: "CycleCountPlans",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CycleCountRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CountedQuantity = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CycleCountTaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    InspectorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    ScannedHandlingUnitId = table.Column<Guid>(type: "uuid", nullable: true),
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

            migrationBuilder.AddForeignKey(
                name: "FK_CycleCountPlans_Customers_CustomerId",
                table: "CycleCountPlans",
                column: "CustomerId",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CycleCountPlans_Locations_LocationId",
                table: "CycleCountPlans",
                column: "LocationId",
                principalTable: "Locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CycleCountPlans_Products_ProductId",
                table: "CycleCountPlans",
                column: "ProductId",
                principalTable: "Products",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CycleCountPlans_Zones_ZoneId",
                table: "CycleCountPlans",
                column: "ZoneId",
                principalTable: "Zones",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
