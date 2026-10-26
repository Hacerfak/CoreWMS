using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class EmailConfigs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EmailProvider",
                table: "Companies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "EmailSenderAddress",
                table: "Companies",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EmailSenderName",
                table: "Companies",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GoogleCredentialsJson",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GoogleSenderEmail",
                table: "Companies",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SmtpEnableSsl",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpHost",
                table: "Companies",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SmtpPassword",
                table: "Companies",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SmtpPort",
                table: "Companies",
                type: "integer",
                nullable: true,
                defaultValue: 587);

            migrationBuilder.AddColumn<string>(
                name: "SmtpUser",
                table: "Companies",
                type: "character varying(150)",
                maxLength: 150,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailProvider",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "EmailSenderAddress",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "EmailSenderName",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "GoogleCredentialsJson",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "GoogleSenderEmail",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SmtpEnableSsl",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SmtpHost",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SmtpPassword",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SmtpPort",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SmtpUser",
                table: "Companies");
        }
    }
}
