using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class YardManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "YardAppointmentId",
                table: "OutboundOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "YardAppointmentId",
                table: "InboundOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "YardAppointments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReservationCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    DriverName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    DriverCpf = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    VehiclePlate = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: true),
                    VehiclePlateState = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    CarrierName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CarrierCnpj = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ScheduledDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ArrivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DepartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DockLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    InvoiceNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    InvoiceSerie = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AdditionalNotes = table.Column<string>(type: "text", nullable: true),
                    InboundOrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YardAppointments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YardAppointments_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_YardAppointments_InboundOrders_InboundOrderId",
                        column: x => x.InboundOrderId,
                        principalTable: "InboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_YardAppointments_Locations_DockLocationId",
                        column: x => x.DockLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_YardAppointments_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_CompanyId_ReservationCode",
                table: "YardAppointments",
                columns: new[] { "CompanyId", "ReservationCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_CompanyId_ScheduledDate",
                table: "YardAppointments",
                columns: new[] { "CompanyId", "ScheduledDate" });

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_CompanyId_Status",
                table: "YardAppointments",
                columns: new[] { "CompanyId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_DockLocationId",
                table: "YardAppointments",
                column: "DockLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_InboundOrderId",
                table: "YardAppointments",
                column: "InboundOrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_YardAppointments_OutboundOrderId",
                table: "YardAppointments",
                column: "OutboundOrderId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "YardAppointments");

            migrationBuilder.DropColumn(
                name: "YardAppointmentId",
                table: "OutboundOrders");

            migrationBuilder.DropColumn(
                name: "YardAppointmentId",
                table: "InboundOrders");
        }
    }
}
