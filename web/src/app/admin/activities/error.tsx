"use client";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="admin-activities-error" role="alert">
      <p>โหลดกิจกรรมทั้งหมดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
      <button type="button" onClick={retry}>
        ลองใหม่
      </button>
    </div>
  );
}
