using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateInboundOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ChargeDate",
                table: "BillingItems",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "DocumentId",
                table: "BillingItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                table: "BillingItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DocumentType",
                table: "BillingItems",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ChargeDate",
                table: "BillingItems");

            migrationBuilder.DropColumn(
                name: "DocumentId",
                table: "BillingItems");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                table: "BillingItems");

            migrationBuilder.DropColumn(
                name: "DocumentType",
                table: "BillingItems");
        }
    }
}
