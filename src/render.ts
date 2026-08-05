/**
 * Admin HTML table builder.
 *
 * Renders D1 query results as simple HTML tables for the /admin page.
 */

import type { ResourceValues } from "./types";

export function BuildTable(
	name: string,
	dataRows: Record<string, string | number | boolean | null>[] | undefined,
): string {
	const container = (value: string) =>
		`<div class="dataContainer"><h3>${escapeHtml(name)}</h3>${value}</div>`;

	if (!dataRows?.length) {
		return container("<p>No data.</p>");
	}

	const columns = Object.keys(dataRows[0]);
	const head = columns
		.map((column) => `<th>${escapeHtml(column)}</th>`)
		.join("");
	const body = dataRows
		.map((row) => {
			return `<tr>${columns.map((column) => `<td>${resourceValueToString(row[column])}</td>`).join("")}</tr>`;
		})
		.join("");

	return container(
		`<table class="dataTable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
	);
}

function resourceValueToString(value: ResourceValues): string {
	if (value == null) return "null";
	return escapeHtml(value.toString());
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
