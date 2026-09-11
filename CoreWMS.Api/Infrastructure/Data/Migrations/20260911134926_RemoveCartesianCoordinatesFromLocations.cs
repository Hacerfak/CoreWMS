using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCartesianCoordinatesFromLocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Aisle",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "Building",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "Locations");

            migrationBuilder.DropColumn(
                name: "Slot",
                table: "Locations");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Aisle",
                table: "Locations",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Building",
                table: "Locations",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Level",
                table: "Locations",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Slot",
                table: "Locations",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);
        }
    }
}
