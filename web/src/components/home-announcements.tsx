import type { HomeAnnouncement } from "@/lib/admin-announcements";

interface HomeAnnouncementsProps {
  items: HomeAnnouncement[];
  heading: string;
}

export function HomeAnnouncements({ items, heading }: HomeAnnouncementsProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label={heading} className="home-announcements card">
      <div className="home-announcements-heading">
        <span className="home-announcements-dot" aria-hidden="true" />
        <h2>{heading}</h2>
      </div>
      <ul className="home-announcements-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            {item.body ? <p className="home-announcement-body">{item.body}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
