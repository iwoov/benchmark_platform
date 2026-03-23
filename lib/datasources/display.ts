import type { DataSourceStatus, DataSourceType } from "@prisma/client";

export function getDataSourceTypeLabel(type: DataSourceType) {
  if (type === "DINGTALK_BITABLE") return "钉钉表格";
  if (type === "JSON_UPLOAD") return "JSON 导入";
  return "Excel 导入";
}

export function getDataSourceTypeColor(type: DataSourceType) {
  if (type === "DINGTALK_BITABLE") return "processing";
  if (type === "JSON_UPLOAD") return "gold";
  return "green";
}

export function getDataSourceStatusLabel(status: DataSourceStatus) {
  return status === "ACTIVE" ? "启用中" : "已停用";
}

export function getDataSourceStatusColor(status: DataSourceStatus) {
  return status === "ACTIVE" ? "success" : "default";
}
