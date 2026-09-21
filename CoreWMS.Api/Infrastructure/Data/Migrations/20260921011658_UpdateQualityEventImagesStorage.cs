using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateQualityEventImagesStorage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Base64Data",
                table: "QualityEventImages",
                newName: "FilePath");

            migrationBuilder.AddColumn<long>(
                name: "FileSizeBytes",
                table: "QualityEventImages",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FileSizeBytes",
                table: "QualityEventImages");

            migrationBuilder.RenameColumn(
                name: "FilePath",
                table: "QualityEventImages",
                newName: "Base64Data");
        }
    }
}
