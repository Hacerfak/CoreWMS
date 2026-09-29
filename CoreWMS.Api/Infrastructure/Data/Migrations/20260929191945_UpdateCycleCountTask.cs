using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateCycleCountTask : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "IsStrictLpnMode",
                table: "CycleCountTasks",
                newName: "IsDynamicStorage");

            migrationBuilder.AlterColumn<decimal>(
                name: "ExpectedQuantity",
                table: "CycleCountTasks",
                type: "numeric(18,10)",
                precision: 18,
                scale: 10,
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "AdjustmentType",
                table: "CycleCountTasks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "CountedQuantity",
                table: "CycleCountTasks",
                type: "numeric(18,10)",
                precision: 18,
                scale: 10,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FiscalDocumentId",
                table: "CycleCountTasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FiscalDocumentNumber",
                table: "CycleCountTasks",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FiscalNotes",
                table: "CycleCountTasks",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Batch",
                table: "CycleCountPlans",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdjustmentType",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "CountedQuantity",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "FiscalDocumentId",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "FiscalDocumentNumber",
                table: "CycleCountTasks");

            migrationBuilder.DropColumn(
                name: "FiscalNotes",
                table: "CycleCountTasks");

            migrationBuilder.RenameColumn(
                name: "IsDynamicStorage",
                table: "CycleCountTasks",
                newName: "IsStrictLpnMode");

            migrationBuilder.AlterColumn<int>(
                name: "ExpectedQuantity",
                table: "CycleCountTasks",
                type: "integer",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,10)",
                oldPrecision: 18,
                oldScale: 10);

            migrationBuilder.AlterColumn<string>(
                name: "Batch",
                table: "CycleCountPlans",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);
        }
    }
}
