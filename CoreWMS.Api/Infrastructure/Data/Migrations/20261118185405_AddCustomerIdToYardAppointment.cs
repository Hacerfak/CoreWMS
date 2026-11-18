using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations;

/// <inheritdoc />
public partial class _20261118185405_AddCustomerIdToYardAppointment : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "CustomerId",
            table: "YardAppointments",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_YardAppointments_CustomerId",
            table: "YardAppointments",
            column: "CustomerId");

        migrationBuilder.AddForeignKey(
            name: "FK_YardAppointments_Customers_CustomerId",
            table: "YardAppointments",
            column: "CustomerId",
            principalTable: "Customers",
            principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_YardAppointments_Customers_CustomerId",
            table: "YardAppointments");

        migrationBuilder.DropIndex(
            name: "IX_YardAppointments_CustomerId",
            table: "YardAppointments");

        migrationBuilder.DropColumn(
            name: "CustomerId",
            table: "YardAppointments");
    }
}
