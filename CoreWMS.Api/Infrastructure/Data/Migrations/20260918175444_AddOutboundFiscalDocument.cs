using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOutboundFiscalDocument : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OutboundFiscalDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    Protocol = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ReturnMessage = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboundFiscalDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OutboundFiscalDocuments_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_AccessKey",
                table: "OutboundFiscalDocuments",
                column: "AccessKey");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_OutboundOrderId",
                table: "OutboundFiscalDocuments",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OutboundFiscalDocuments_Status",
                table: "OutboundFiscalDocuments",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OutboundFiscalDocuments");
        }
    }
}
