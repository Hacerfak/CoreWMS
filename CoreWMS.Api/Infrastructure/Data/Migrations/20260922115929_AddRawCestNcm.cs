using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRawCestNcm : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RawCest",
                table: "InboundOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RawUnit",
                table: "InboundOrderItems",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RawCest",
                table: "InboundOrderItems");

            migrationBuilder.DropColumn(
                name: "RawUnit",
                table: "InboundOrderItems");
        }
    }
}
