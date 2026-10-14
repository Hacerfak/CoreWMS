using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoreWMS.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class EvolveFiscalRulesAndAddCompanyFiscalDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FiscalOperationRules_Customers_SpecificCustomerId",
                table: "FiscalOperationRules");

            migrationBuilder.DropTable(
                name: "OutboundFiscalDocuments");

            migrationBuilder.DropIndex(
                name: "IX_FiscalOperationRules_CompanyId",
                table: "FiscalOperationRules");

            migrationBuilder.DropIndex(
                name: "IX_FiscalOperationRules_SpecificCustomerId",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "SpecificCustomerId",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "SpecificDestinationState",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "SpecificNcmStart",
                table: "FiscalOperationRules");

            migrationBuilder.RenameColumn(
                name: "Priority",
                table: "FiscalOperationRules",
                newName: "ModBcIcmsSt");

            migrationBuilder.RenameColumn(
                name: "OperationType",
                table: "FiscalOperationRules",
                newName: "ModBcIcms");

            migrationBuilder.RenameColumn(
                name: "CstPisCofins",
                table: "FiscalOperationRules",
                newName: "CstPis");

            migrationBuilder.AlterColumn<string>(
                name: "CstIbs",
                table: "FiscalOperationRules",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CstCbs",
                table: "FiscalOperationRules",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "AliqIbs",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AlterColumn<decimal>(
                name: "AliqCbs",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric");

            migrationBuilder.AddColumn<decimal>(
                name: "AliqCofins",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqCreditoSimples",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqIcms",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqIcmsSt",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqIpi",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AliqPis",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ClassificacaoTributaria",
                table: "FiscalOperationRules",
                type: "character varying(6)",
                maxLength: 6,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CodigoEnquadramentoIpi",
                table: "FiscalOperationRules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CstCofins",
                table: "FiscalOperationRules",
                type: "character varying(2)",
                maxLength: 2,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "Finalidade",
                table: "FiscalOperationRules",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MotivoDesoneracaoIcms",
                table: "FiscalOperationRules",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MvaIcmsSt",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ReducaoBcIcms",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "ReducaoBcIcmsSt",
                table: "FiscalOperationRules",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "CompanyFiscalDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    Protocol = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ReturnMessage = table.Column<string>(type: "text", nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyFiscalDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompanyFiscalDocuments_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CompanyFiscalDocuments_OutboundOrders_OutboundOrderId",
                        column: x => x.OutboundOrderId,
                        principalTable: "OutboundOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FiscalOperationRuleExceptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalOperationRuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    SpecificDestinationState = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    SpecificNcmStart = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    SpecificOrigin = table.Column<int>(type: "integer", nullable: true),
                    CfopStateInternal = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    CfopInterstate = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    CstCsosnIcms = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    ModBcIcms = table.Column<int>(type: "integer", nullable: true),
                    AliqIcms = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ReducaoBcIcms = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ModBcIcmsSt = table.Column<int>(type: "integer", nullable: true),
                    MvaIcmsSt = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ReducaoBcIcmsSt = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    AliqIcmsSt = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    MotivoDesoneracaoIcms = table.Column<int>(type: "integer", nullable: true),
                    AliqCreditoSimples = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CstIpi = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    CodigoEnquadramentoIpi = table.Column<int>(type: "integer", nullable: true),
                    AliqIpi = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CstPis = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    AliqPis = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CstCofins = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    AliqCofins = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CstIbs = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    AliqIbs = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CstCbs = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    AliqCbs = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ClassificacaoTributaria = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: true),
                    AdditionalNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalOperationRuleExceptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FiscalOperationRuleExceptions_FiscalOperationRules_FiscalOp~",
                        column: x => x.FiscalOperationRuleId,
                        principalTable: "FiscalOperationRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_CompanyId_Description",
                table: "FiscalOperationRules",
                columns: new[] { "CompanyId", "Description" });

            migrationBuilder.CreateIndex(
                name: "IX_CompanyFiscalDocuments_AccessKey",
                table: "CompanyFiscalDocuments",
                column: "AccessKey");

            migrationBuilder.CreateIndex(
                name: "IX_CompanyFiscalDocuments_CompanyId",
                table: "CompanyFiscalDocuments",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_CompanyFiscalDocuments_OutboundOrderId",
                table: "CompanyFiscalDocuments",
                column: "OutboundOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_CompanyFiscalDocuments_Status",
                table: "CompanyFiscalDocuments",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRuleExceptions_FiscalOperationRuleId",
                table: "FiscalOperationRuleExceptions",
                column: "FiscalOperationRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRuleExceptions_FiscalOperationRuleId_Specifi~",
                table: "FiscalOperationRuleExceptions",
                columns: new[] { "FiscalOperationRuleId", "SpecificDestinationState", "SpecificNcmStart", "SpecificOrigin" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CompanyFiscalDocuments");

            migrationBuilder.DropTable(
                name: "FiscalOperationRuleExceptions");

            migrationBuilder.DropIndex(
                name: "IX_FiscalOperationRules_CompanyId_Description",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqCofins",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqCreditoSimples",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqIcms",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqIcmsSt",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqIpi",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "AliqPis",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "ClassificacaoTributaria",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "CodigoEnquadramentoIpi",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "CstCofins",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "Finalidade",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "MotivoDesoneracaoIcms",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "MvaIcmsSt",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "ReducaoBcIcms",
                table: "FiscalOperationRules");

            migrationBuilder.DropColumn(
                name: "ReducaoBcIcmsSt",
                table: "FiscalOperationRules");

            migrationBuilder.RenameColumn(
                name: "ModBcIcmsSt",
                table: "FiscalOperationRules",
                newName: "Priority");

            migrationBuilder.RenameColumn(
                name: "ModBcIcms",
                table: "FiscalOperationRules",
                newName: "OperationType");

            migrationBuilder.RenameColumn(
                name: "CstPis",
                table: "FiscalOperationRules",
                newName: "CstPisCofins");

            migrationBuilder.AlterColumn<string>(
                name: "CstIbs",
                table: "FiscalOperationRules",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(3)",
                oldMaxLength: 3,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "CstCbs",
                table: "FiscalOperationRules",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(3)",
                oldMaxLength: 3,
                oldNullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "AliqIbs",
                table: "FiscalOperationRules",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(5,2)",
                oldPrecision: 5,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "AliqCbs",
                table: "FiscalOperationRules",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(5,2)",
                oldPrecision: 5,
                oldScale: 2);

            migrationBuilder.AddColumn<Guid>(
                name: "SpecificCustomerId",
                table: "FiscalOperationRules",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpecificDestinationState",
                table: "FiscalOperationRules",
                type: "character varying(2)",
                maxLength: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SpecificNcmStart",
                table: "FiscalOperationRules",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OutboundFiscalDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OutboundOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessKey = table.Column<string>(type: "character varying(44)", maxLength: 44, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Protocol = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    RawXml = table.Column<string>(type: "text", nullable: true),
                    ReturnMessage = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
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
                name: "IX_FiscalOperationRules_CompanyId",
                table: "FiscalOperationRules",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_FiscalOperationRules_SpecificCustomerId",
                table: "FiscalOperationRules",
                column: "SpecificCustomerId");

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

            migrationBuilder.AddForeignKey(
                name: "FK_FiscalOperationRules_Customers_SpecificCustomerId",
                table: "FiscalOperationRules",
                column: "SpecificCustomerId",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
