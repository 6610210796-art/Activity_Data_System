import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getAdminActivitiesForExport,
  getAdminActivitiesOptions,
  AdminActivitiesExportLimitError,
} from "@/lib/admin-activities-data";
import {
  parseAdminActivitiesFilters,
  type AdminActivitiesFilterOptions,
} from "@/lib/admin-activities-query";
import { excelSafeText } from "@/lib/excel-safe";
import { getSiteContent } from "@/lib/content";

export const dynamic = "force-dynamic";

function getIpAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 45);
  }
  return request.headers.get("x-real-ip")?.slice(0, 45) ?? null;
}

function thaiDateValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "session" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const content = await getSiteContent(["form.option.inactive"]);
    const options = await getAdminActivitiesOptions(content["form.option.inactive"]);
    const filterOptions: AdminActivitiesFilterOptions = {
      fiscalYears: options.fiscalYears,
      departments: options.departments,
      activityTypes: options.activityTypes,
    };
    const filters = parseAdminActivitiesFilters(
      request.nextUrl.searchParams,
      filterOptions,
    );
    const { total, items } = await getAdminActivitiesForExport(
      filters,
      content["form.option.inactive"],
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ระบบรวบรวมข้อมูลกิจกรรม";
    const worksheet = workbook.addWorksheet("กิจกรรมทั้งหมด");
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: "A1",
      to: "R1",
    };

    const headers = [
      "ประเภทรายการ",
      "ชื่อกิจกรรม",
      "ปีงบประมาณ",
      "ไตรมาส",
      "หน่วยงานหลัก (รหัสและชื่อ)",
      "หน่วยงานร่วมจัด",
      "ประเภทกิจกรรม",
      "ประเภทผู้เข้าร่วม",
      "วันที่เริ่ม",
      "วันที่สิ้นสุด",
      "สถานะ",
      "จำนวนผู้เข้าร่วม",
      "ความพึงพอใจ %",
      "ผลลัพธ์",
      "สถานที่",
      "ลิงก์ข้อมูล",
      "ผู้บันทึก",
      "วันที่บันทึก",
    ];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3D7A" },
    };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.columns = [
      { width: 18 },
      { width: 38 },
      { width: 14 },
      { width: 12 },
      { width: 32 },
      { width: 28 },
      { width: 28 },
      { width: 24 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 48 },
      { width: 24 },
      { width: 40 },
      { width: 24 },
      { width: 22 },
    ];

    for (const item of items) {
      const start = thaiDateValue(item.startDate);
      const end = thaiDateValue(item.endDate);
      const status =
        item.status === "past"
          ? "เกิดขึ้นแล้ว"
          : item.status === "confirmed"
            ? "ยืนยันวันแล้ว"
            : "ยังไม่ยืนยันวัน";
      worksheet.addRow([
        item.kind === "past" ? "เกิดขึ้นแล้ว" : "ที่จะเกิดขึ้น",
        excelSafeText(item.title),
        item.fiscalYear,
        item.quarterNo,
        excelSafeText(`${item.mainDepartment} — ${item.mainDepartmentName}`),
        excelSafeText(item.coOrganizers.join(", ")),
        excelSafeText(item.activityTypeName),
        excelSafeText(item.participantTypeName),
        start,
        end,
        status,
        item.participants,
        item.satisfactionPercent,
        excelSafeText(item.resultSummary),
        excelSafeText(item.location),
        excelSafeText(item.refLink),
        excelSafeText(item.creatorName),
        excelSafeText(item.createdAt),
      ]);
      if (start) worksheet.getCell(worksheet.lastRow!.number, 9).numFmt = "dd/mm/yyyy";
      if (end) worksheet.getCell(worksheet.lastRow!.number, 10).numFmt = "dd/mm/yyyy";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const detail = JSON.stringify({
      filters,
      rowCount: total,
    });
    await getDb().execute(
      `INSERT INTO audit_logs (user_id, action, entity, detail, ip_address)
       VALUES (?, 'export.excel', 'activities', ?, ?)`,
      [user.id, detail, getIpAddress(request)],
    );

    const today = new Date().toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const datePart = today.replaceAll("/", "-");
    const filename = `activities_${datePart}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AdminActivitiesExportLimitError) {
      return NextResponse.json(
        { error: "export.limit", message: error.message },
        { status: 400 },
      );
    }
    console.error("Admin activity Excel export failed", error);
    return NextResponse.json(
      { error: "export.failed" },
      { status: 500 },
    );
  }
}
