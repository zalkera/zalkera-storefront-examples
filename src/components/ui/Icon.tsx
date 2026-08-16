import {
    Award,
    BadgeCheck,
    Building2,
    CalendarCheck,
    Clock,
    Compass,
    CreditCard,
    FileText,
    Globe,
    Handshake,
    HeartHandshake,
    Layers,
    Lightbulb,
    LineChart,
    Lock,
    Mail,
    MapPin,
    MessageCircle,
    Package,
    Phone,
    Rocket,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    Star,
    Target,
    TrendingUp,
    Truck,
    UserCheck,
    Users,
    Wrench,
} from "lucide-react";
import type {LucideIcon} from "lucide-react";

/**
 * 아이콘 큐레이션 맵 — 섹션 config 의 `icon` 문자열이 여기 키만 가리킨다.
 *
 * **임의 문자열·전체 lucide 동적 로딩은 하지 않는다**(DON'T-BUILD): 번들이 커지고, 콘솔이 셀렉트를
 * 못 내며, 말로 고치기가 "있는 것 중에 고르기"가 아니라 "이름 맞히기"가 된다. 목록의 정본은 백엔드
 * `doc/contracts/section-vocabulary.json` 의 icons.keys 다.
 *
 * 아이콘은 색을 갖지 않는다 — `currentColor` 를 타서 부모의 토큰 색을 상속한다(리터럴 색 0·S4 정합).
 * 크기·색은 className 으로만 준다.
 */
export const ICONS: Record<string, LucideIcon> = {
    "shield-check": ShieldCheck,
    "rocket": Rocket,
    "line-chart": LineChart,
    "trending-up": TrendingUp,
    "users": Users,
    "user-check": UserCheck,
    "clock": Clock,
    "calendar-check": CalendarCheck,
    "phone": Phone,
    "mail": Mail,
    "map-pin": MapPin,
    "building-2": Building2,
    "award": Award,
    "handshake": Handshake,
    "heart-handshake": HeartHandshake,
    "badge-check": BadgeCheck,
    "star": Star,
    "sparkles": Sparkles,
    "target": Target,
    "compass": Compass,
    "lightbulb": Lightbulb,
    "settings": Settings,
    "wrench": Wrench,
    "layers": Layers,
    "package": Package,
    "truck": Truck,
    "credit-card": CreditCard,
    "lock": Lock,
    "globe": Globe,
    "message-circle": MessageCircle,
    "file-text": FileText,
    "search": Search,
};

export const ICON_KEYS = Object.keys(ICONS);

/**
 * 이름으로 아이콘을 그린다. **미지 이름은 fail-soft** — 아무것도 안 그리고 넘어간다.
 * codegen·고객 재업로드가 계약에 없는 값을 넣을 수 있는데, 그 때문에 페이지가 죽으면 안 된다.
 */
export function Icon({name, className}: {name?: string | null; className?: string}) {
    const Glyph = name ? ICONS[name] : undefined;
    if (!Glyph) return null;
    return <Glyph className={className ?? "size-6"} aria-hidden="true" />;
}
