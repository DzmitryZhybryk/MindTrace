import { Avatar, Menu, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";

import { BrandMark } from "../components/BrandMark";
import "./home.css";

const TABS = [
  { label: "Journey", to: "/journey" },
  { label: "Mind", to: "/mind" },
] as const;

const STATS = [
  { name: "Countries", meta: "12 visited" },
  { name: "Cities", meta: "47 visited" },
  { name: "Streak", meta: "7 days" },
] as const;

const RECOMMENDED = {
  countries: [
    { name: "Norway", desc: "Fjords and aurora skies" },
    { name: "Vietnam", desc: "Street food and old temples" },
    { name: "Peru", desc: "Andean trails to Machu Picchu" },
  ],
  cities: [
    { name: "Kyoto", desc: "Zen gardens, quiet shrines" },
    { name: "Porto", desc: "Riverside wine and azulejos" },
    { name: "Reykjavik", desc: "Geothermal lagoons up north" },
  ],
} as const;

const RECENT = [
  { city: "Tokyo", date: "Mar 2026" },
  { city: "Lisbon", date: "Jan 2026" },
  { city: "Berlin", date: "Nov 2025" },
] as const;

const GREETING_NAME = "Dzmitry";
const GREETING_DATE = "Saturday · May 2026";
const AURA_WORD = "atmosphere · still";

export function HomePage() {
  return (
    <div className="home-shell">
      <header className="home-header">
        <div className="home-header__brand">
          <BrandMark />
        </div>

        <nav className="home-tabs" aria-label="Primary sections">
          {TABS.map((tab) => (
            <Link key={tab.label} to={tab.to} className="home-tab">
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="home-header__user">
          <Menu position="bottom-end" withArrow shadow="md" radius="md" width={180}>
            <Menu.Target>
              <UnstyledButton aria-label="Open profile menu" className="home-avatar-button">
                <Avatar radius="xl" size="md" color="slate" name="Dzmitry Zhybryk" />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item>Profile</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red">Logout</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </header>

      <main className="home-main">
        <aside className="home-recommend" aria-label="Recommended for you">
          <div className="home-recommend__head">
            <span className="home-recommend__title">you might like</span>
            <span className="home-recommend__caption">
              Based on places you've rated — or travelers like you, until we know your taste
            </span>
          </div>

          <div className="home-recommend__group">
            <span className="home-recommend__group-label">countries</span>
            <ul className="home-recommend__list">
              {RECOMMENDED.countries.map((item) => (
                <li key={item.name} className="home-recommend__item">
                  <span className="home-recommend__name">{item.name}</span>
                  <span className="home-recommend__desc">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-recommend__group">
            <span className="home-recommend__group-label">cities</span>
            <ul className="home-recommend__list">
              {RECOMMENDED.cities.map((item) => (
                <li key={item.name} className="home-recommend__item">
                  <span className="home-recommend__name">{item.name}</span>
                  <span className="home-recommend__desc">{item.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="home-stage-cluster">
          <div className="home-greeting">
            <span className="home-greeting__hello">Hello, {GREETING_NAME}</span>
            <span className="home-greeting__date">{GREETING_DATE}</span>
          </div>

          <div className="home-stage" role="img" aria-label="Globe placeholder">
            <span className="home-stage__hint">globe goes here</span>
          </div>

          <p className="home-aura">{AURA_WORD}</p>
        </div>

        <aside className="home-right" aria-label="Activity">
          <div className="home-stats">
            <span className="home-stats__title">achievements</span>
            <ul className="home-stats__list">
              {STATS.map((stat) => (
                <li key={stat.name} className="home-stat">
                  <span className="home-stat__name">{stat.name}</span>
                  <span className="home-stat__meta">{stat.meta}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="home-recent">
            <span className="home-recent__title">recent</span>
            <ul className="home-recent__list">
              {RECENT.map((entry) => (
                <li key={entry.city} className="home-recent__item">
                  <span className="home-recent__city">{entry.city}</span>
                  <span className="home-recent__date">{entry.date}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
