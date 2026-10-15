using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OutboundVolume_OutboundOrders_OutboundOrderId",
                table: "OutboundVolume");

            migrationBuilder.DropForeignKey(
                name: "FK_OutboundVolume_PackagingTypes_PackagingTypeId",
                table: "OutboundVolume");

            migrationBuilder.DropPrimaryKey(
                name: "PK_OutboundVolume",
                table: "OutboundVolume");

            migrationBuilder.RenameTable(
                name: "OutboundVolume",
                newName: "OutboundVolumes");

            migrationBuilder.RenameIndex(
                name: "IX_OutboundVolume_PackagingTypeId",
                table: "OutboundVolumes",
                newName: "IX_OutboundVolumes_PackagingTypeId");

            migrationBuilder.RenameIndex(
                name: "IX_OutboundVolume_OutboundOrderId",
                table: "OutboundVolumes",
                newName: "IX_OutboundVolumes_OutboundOrderId");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "BillingServices",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AlterColumn<string>(
                name: "VolumeLpn",
                table: "OutboundVolumes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<decimal>(
                name: "GrossWeight",
                table: "OutboundVolumes",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AddPrimaryKey(
                name: "PK_OutboundVolumes",
                table: "OutboundVolumes",
                column: "Id");

            migrationBuilder.CreateTable(
                name: "OutboundItemPacks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    PackagingTypeId = table.Column<Guid>(type: "uuid", nullable: false),
                    VolumeCount = table.Column<int>(type: "integer", nullable: false),
                    QuantityPerVolume = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundItemPacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundItemPacks_OutboundOrderItems_OutboundOrderItemId",
                        column: x => x.OutboundOrderItemId,
                        principalTable: "OutboundOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundItemPacks_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OutboundItemPacks_PackagingTypes_PackagingTypeId",
                        column: x => x.PackagingTypeId,
                        principalTable: "PackagingTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundItemPacks_OutboundOrderId",
                table: "OutboundItemPacks",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundItemPacks_OutboundOrderItemId",
                table: "OutboundItemPacks",
                column: "OutboundOrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundItemPacks_PackagingTypeId",
                table: "OutboundItemPacks",
                column: "PackagingTypeId");

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundVolumes_OutboundOrders_OutboundOrderId",
                table: "OutboundVolumes",
                column: "OutboundOrderId",
                principalTable: "OutboundOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundVolumes_PackagingTypes_PackagingTypeId",
                table: "OutboundVolumes",
                column: "PackagingTypeId",
                principalTable: "PackagingTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OutboundVolumes_OutboundOrders_OutboundOrderId",
                table: "OutboundVolumes");

            migrationBuilder.DropForeignKey(
                name: "FK_OutboundVolumes_PackagingTypes_PackagingTypeId",
                table: "OutboundVolumes");

            migrationBuilder.DropTable(
                name: "OutboundItemPacks");

            migrationBuilder.DropPrimaryKey(
                name: "PK_OutboundVolumes",
                table: "OutboundVolumes");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "BillingServices");

            migrationBuilder.RenameTable(
                name: "OutboundVolumes",
                newName: "OutboundVolume");

            migrationBuilder.RenameIndex(
                name: "IX_OutboundVolumes_PackagingTypeId",
                table: "OutboundVolume",
                newName: "IX_OutboundVolume_PackagingTypeId");

            migrationBuilder.RenameIndex(
                name: "IX_OutboundVolumes_OutboundOrderId",
                table: "OutboundVolume",
                newName: "IX_OutboundVolume_OutboundOrderId");

            migrationBuilder.AlterColumn<string>(
                name: "VolumeLpn",
                table: "OutboundVolume",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100);

            migrationBuilder.AlterColumn<decimal>(
                name: "GrossWeight",
                table: "OutboundVolume",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,3)",
                oldPrecision: 18,
                oldScale: 3);

            migrationBuilder.AddPrimaryKey(
                name: "PK_OutboundVolume",
                table: "OutboundVolume",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundVolume_OutboundOrders_OutboundOrderId",
                table: "OutboundVolume",
                column: "OutboundOrderId",
                principalTable: "OutboundOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_OutboundVolume_PackagingTypes_PackagingTypeId",
                table: "OutboundVolume",
                column: "PackagingTypeId",
                principalTable: "PackagingTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
