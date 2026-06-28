// Professional icons via lucide-react, re-exported under the names this app uses
// so every existing import keeps working. A few filled/brand marks stay custom.
export {
  Phone,
  Mail,
  MapPin,
  Check,
  Home,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Camera,
  Clock,
  Shield,
  Car,
  Gift,
  Menu,
  X,
  Calendar,
  Sparkles,
  Upload,
  Search,
  ExternalLink,
  Lock,
  Send,
  Activity,
  Database,
  Tag,
  Banknote,
  Users,
  Hand,
  Handshake,
  Landmark,
  ArrowLeftRight,
  DollarSign as Dollar,
  Trash2 as Trash,
  Zap as Bolt,
  MessageCircle as Chat,
} from "lucide-react";

type P = { className?: string };

// Filled star (lucide's Star is an outline — ratings want a solid star).
export const Star = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
  </svg>
);

export const Quote = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M7.5 6C5 6 3 8 3 10.5S5 15 7.5 15c0 2-1 3.5-3 4.5l.8 1.5C8.7 19.6 11 16.7 11 12.5 11 8.9 9.5 6 7.5 6Zm10 0C15 6 13 8 13 10.5s2 4.5 4.5 4.5c0 2-1 3.5-3 4.5l.8 1.5C18.7 19.6 21 16.7 21 12.5 21 8.9 19.5 6 17.5 6Z" />
  </svg>
);

// Brand / region marks not in lucide.
export const Facebook = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
  </svg>
);

export const Instagram = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" />
  </svg>
);

export const TikTok = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
);

export const MapleLeaf = ({ className }: P) => (
  <svg className={className} width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2l1.3 3.3 2.5-1.6-.6 3 3-.4-1.9 2.4 2.7 1.5-2.9.9 1.6 2.6-3.2-.6.2 2.2-2-1.4-.5 4.6h-1.6l-.5-4.6-2 1.4.2-2.2-3.2.6 1.6-2.6-2.9-.9 2.7-1.5L4.8 6.3l3 .4-.6-3 2.5 1.6L12 2Z" />
  </svg>
);

// Official multicolor Google "G" (brand mark — fixed colors).
export const GoogleG = ({ className }: P) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);
