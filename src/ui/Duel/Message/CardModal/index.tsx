import { CloseOutlined } from "@ant-design/icons";
import { Divider, Space, Tag } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import {
  type CardMeta,
  fetchCard,
  fetchStrings,
  getStrings,
  Region,
} from "@/api";
import { cardStore, isMe } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import {
  Attribute2StringCodeMap,
  extraCardTypes,
  Race2StringCodeMap,
  TYPE_LINK,
  Type2StringCodeMap,
} from "../../../../common";
import { isFaceDownPosition } from "../../layout/geometry";
import { duelPanels } from "../../layout/panels";
import { Desc } from "./Desc";
import styles from "./index.module.scss";

const CARD_WIDTH = "220px";

const defaultStore = {
  isOpen: false,
  uuid: undefined as string | undefined,
  meta: {
    id: 0,
    data: {},
    text: {
      name: "",
      desc: "",
    },
  } satisfies CardMeta as CardMeta,
  interactivies: [] as {
    desc: string;
    response: number;
    effectCode?: number;
  }[],
  counters: {} as Record<number, number>,
};

const store = proxy(defaultStore);

export const CardModal = () => {
  const snap = useSnapshot(store);

  const { inner } = useSnapshot(cardStore);
  const panels = useSnapshot(duelPanels);
  const uuid = snap.uuid;
  const live = uuid ? inner.find((card) => card.uuid === uuid) : undefined;
  const { isOpen } = snap;
  const meta = live?.code ? live.meta : snap.meta;
  const counters = live?.counters ?? snap.counters;
  if (!isOpen) return null;

  // Runtime card state may contain only a name/stat update. Keep printed
  // rules text available from the database rather than erasing the panel.
  const printedText = meta?.text.desc
    ? meta.text
    : fetchCard(live?.code || meta.id).text;
  const name = meta?.text.name || printedText.name;
  const types = extraCardTypes(meta?.data.type ?? 0);
  const race = meta?.data.race;
  const attribute = meta?.data.attribute;
  const desc = meta?.text.desc || printedText.desc;
  const atk = meta?.data.atk;
  const def = meta?.data.def;

  return (
    <aside
      className={styles.drawer}
      aria-label="卡片说明"
      data-testid="duel-card-description-panel"
    >
      <header className={styles.header}>
        <strong>{name}</strong>
        <button
          type="button"
          aria-label="关闭卡片说明"
          onClick={() => (store.isOpen = false)}
        >
          <CloseOutlined />
        </button>
      </header>
      <div
        className={styles.container}
        data-testid="duel-card-detail"
        data-card-code={meta?.id}
      >
        <Space
          align="start"
          size={18}
          style={{ position: "relative", display: "flex" }}
        >
          <YgoCard
            code={meta?.id}
            width={CARD_WIDTH}
            style={{ borderRadius: 4 }}
          />
          <Space direction="vertical" className={styles.info}>
            <AtkLine
              atk={atk}
              def={types.includes(TYPE_LINK) ? undefined : def}
            />
            <CounterLine counters={counters} />
            <AttLine types={types} race={race} attribute={attribute} />
            {/* TODO: 只有怪兽卡需要展示攻击防御 */}
            {/* TODO: 展示星级/LINK数 */}
          </Space>
        </Space>
        <Divider style={{ margin: "0.875rem 0" }}></Divider>
        <Desc desc={desc} />
        {snap.uuid &&
          panels.cardHints[snap.uuid]?.map((hint, index) => (
            <p key={index} data-testid="duel-card-hint">
              {hint.type === 2
                ? `卡片记录：${fetchCard(hint.value).text.name}`
                : hint.type === 6
                ? getStrings(hint.value)
                : `记录：${hint.value}`}
            </p>
          ))}
      </div>
    </aside>
  );
};

const AttLine = (props: {
  types: number[];
  race?: number;
  attribute?: number;
}) => {
  const race = props.race
    ? fetchStrings(Region.System, Race2StringCodeMap.get(props.race) || 0)
    : undefined;
  const attribute = props.attribute
    ? fetchStrings(
        Region.System,
        Attribute2StringCodeMap.get(props.attribute) || 0,
      )
    : undefined;
  const types = props.types
    .map((t) => fetchStrings(Region.System, Type2StringCodeMap.get(t) || 0))
    .join("/");
  return (
    <div className={styles.attline}>
      {attribute && <Tag>{attribute}</Tag>}
      {race && <Tag>{race}</Tag>}
      {types && <Tag>{types}</Tag>}
    </div>
  );
};

const AtkLine = (props: { atk?: number; def?: number }) => (
  <Space
    size={10}
    className={styles.atkLine}
    direction="vertical"
    data-testid="duel-card-stats"
  >
    <div
      data-testid="duel-card-stat"
      data-stat="ATK"
      data-stat-value={props.atk ?? ""}
    >
      <div className={styles.title}>ATK</div>
      <div className={styles.number}>{props.atk ?? "?"}</div>
    </div>
    <div
      data-testid="duel-card-stat"
      data-stat="DEF"
      data-stat-value={props.def ?? ""}
    >
      <div className={styles.title}>DEF</div>
      <div className={styles.number}>{props.def ?? "?"}</div>
    </div>
  </Space>
);

const CounterLine = (props: { counters: { [type: number]: number } }) => {
  return (
    <Space size={10} className={styles.counterLine} direction="vertical">
      {Object.entries(props.counters).map(
        ([counterType, count], idx) =>
          count > 0 && (
            <div
              key={idx}
              data-testid="duel-card-counter"
              data-counter-type={counterType}
              data-counter-count={count}
            >
              <div className={styles.title}>
                {fetchStrings(
                  Region.Counter,
                  `0x${Number(counterType).toString(16)}`,
                )}
              </div>
              <div className={styles.number}>{count}</div>
            </div>
          ),
      )}
    </Space>
  );
};

export const showCardModal = (
  card: Partial<Pick<typeof store, "meta" | "counters" | "uuid">>,
  revealed = false,
) => {
  if (!card.meta?.id) return;
  const live = card.uuid
    ? cardStore.inner.find((entry) => entry.uuid === card.uuid)
    : undefined;
  if (
    !revealed &&
    live &&
    !isMe(live.location.controller) &&
    isFaceDownPosition(live.location.position)
  )
    return;
  store.uuid = card.uuid;
  store.isOpen = true;
  store.meta = card?.meta ?? defaultStore.meta;
  store.counters = card?.counters ?? defaultStore.counters;
};

export const closeCardModal = () => {
  store.isOpen = false;
};
