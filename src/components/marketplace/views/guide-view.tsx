"use client";

import { useState } from "react";
import Image from "next/image";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CarFront,
  Search,
  ShieldCheck,
  QrCode,
  CreditCard,
  MessageSquare,
  Sparkles,
  Building2,
  FileCheck2,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Upload,
  Bot,
  Users,
  Award,
  Lock,
  Tag,
  FileText,
  BadgeAlert,
  Send,
  Clock,
  Eye,
  ChevronRight,
  Bike,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideViewProps {
  initialTab?: "buyer" | "seller" | "dealer" | "payments" | "faq";
}

type GuideLocale = "vi" | "zh";
type GuideTab = NonNullable<GuideViewProps["initialTab"]>;

const localizedGuide: Record<GuideLocale, {
  badge: string;
  title: string;
  subtitle: string;
  browse: string;
  create: string;
  tabs: Record<GuideTab, string>;
  sections: Record<GuideTab, {
    title: string;
    intro: string;
    steps: { title: string; description: string; image?: string; alt?: string; caption?: string }[];
    note?: string;
  }>;
}> = {
  vi: {
    badge: "Hướng dẫn sử dụng KhLan",
    title: "Cách sử dụng chợ xe KhLan",
    subtitle: "Tìm xe, liên hệ người bán, đăng bán xe hoặc phụ tùng và thanh toán gói đăng ký một cách an toàn.",
    browse: "Tìm xe",
    create: "Đăng bán",
    tabs: { buyer: "1. Người mua", seller: "2. Người bán", dealer: "3. Đại lý", payments: "4. Thanh toán", faq: "5. An toàn & FAQ" },
    sections: {
      buyer: {
        title: "Tìm và mua xe",
        intro: "Bạn có thể xem tin đăng công khai. Việc mua xe được thỏa thuận và thanh toán trực tiếp với người bán.",
        steps: [
          { title: "Tìm kiếm và lọc", description: "Chọn ô tô, xe máy hoặc phụ tùng. Lọc theo hãng, giá, năm sản xuất và địa điểm.", image: "/images/guide/buyer-browse.jpg", alt: "Trang tìm kiếm xe với các bộ lọc", caption: "Chọn danh mục rồi dùng bộ lọc để tìm tin phù hợp." },
          { title: "Xem thông tin xe", description: "Đọc mô tả, xem ảnh, giá và thông tin người bán. Báo cáo AI, nếu có, chỉ để tham khảo và không bảo đảm tình trạng xe.", image: "/images/guide/buyer-vehicle-detail.jpg", alt: "Trang chi tiết xe và thông tin người bán", caption: "Kiểm tra kỹ thông tin và ảnh trước khi liên hệ." },
          { title: "Liên hệ và hẹn xem", description: "Gửi tin nhắn để hỏi tình trạng xe, giấy tờ và thời gian xem. Hãy xem xe trực tiếp và tự xác minh giấy tờ.", image: "/images/guide/buyer-contact-seller.jpg", alt: "Hộp thoại liên hệ người bán", caption: "Dùng cuộc trò chuyện để hỏi và thống nhất lịch xem xe." },
          { title: "Thỏa thuận trực tiếp", description: "Kiểm tra xe và giấy tờ trước khi thanh toán. KhLan không thu tiền mua xe; KHQR trên trang web chỉ dùng để trả phí đăng ký.", image: "/images/guide/buyer-request-viewing.jpg", alt: "Hướng dẫn hẹn xem xe", caption: "Gặp người bán, kiểm tra xe và hoàn tất giao dịch trực tiếp." },
        ],
        note: "Không chuyển tiền đặt cọc trước khi xác minh người bán và xe.",
      },
      seller: {
        title: "Đăng bán xe hoặc phụ tùng",
        intro: "Đăng nhập bằng tài khoản người bán có gói đăng ký hoặc dùng thử còn hiệu lực, sau đó làm theo từng bước.",
        steps: [
          { title: "Nhập thông tin", description: "Chọn ô tô, xe máy hoặc phụ tùng. Điền hãng, mẫu xe, năm, tình trạng và mô tả chính xác.", image: "/images/guide/seller-listing-details.jpg", alt: "Bước nhập thông tin tin đăng", caption: "Bước 1: Chọn loại sản phẩm và nhập thông tin." },
          { title: "Thêm ảnh", description: "Tải ảnh rõ nét do bạn chụp. Thêm ảnh ngoại thất, nội thất, đồng hồ và các khuyết điểm nếu có.", image: "/images/guide/seller-add-photos.jpg", alt: "Bước thêm ảnh cho tin đăng", caption: "Bước 2: Tải ảnh lên và chọn ảnh bìa." },
          { title: "Đặt giá và đăng", description: "Nhập giá và địa điểm, xem lại thông tin rồi đăng tin. Trả lời người mua và hẹn xem xe trực tiếp.", image: "/images/guide/seller-set-price.jpg", alt: "Bước đặt giá và địa điểm", caption: "Bước 3: Kiểm tra giá và địa điểm trước khi đăng." },
        ],
        note: "Giao dịch mua bán xe diễn ra trực tiếp giữa người mua và người bán.",
      },
      dealer: {
        title: "Dành cho đại lý",
        intro: "Tài khoản đại lý có thể quản lý nhiều tin đăng và thông tin showroom.",
        steps: [
          { title: "Quản lý kho xe", description: "Tạo tin riêng cho từng xe, cập nhật giá và tình trạng để thông tin luôn chính xác." },
          { title: "Thêm chi nhánh", description: "Thiết lập địa điểm showroom và chọn chi nhánh phù hợp khi đăng xe." },
          { title: "Theo dõi liên hệ", description: "Kiểm tra tin nhắn của người mua thường xuyên và sắp xếp lịch xem xe." },
        ],
      },
      payments: {
        title: "Thanh toán phí đăng ký",
        intro: "KHQR trên KhLan chỉ dùng để thanh toán gói đăng ký của người bán. Người mua không trả tiền mua xe cho KhLan.",
        steps: [
          { title: "Chọn gói", description: "Mở trang gói đăng ký, chọn gói phù hợp và kiểm tra số tiền cần thanh toán." },
          { title: "Quét KHQR", description: "Mở ứng dụng ngân hàng, quét mã KHQR hiển thị và kiểm tra tên người nhận cùng số tiền trước khi xác nhận." },
          { title: "Tải biên lai", description: "Quay lại KhLan, tải ảnh biên lai rõ nét và nhập thông tin giao dịch được yêu cầu rồi gửi yêu cầu." },
          { title: "Chờ quản trị viên duyệt", description: "Theo dõi trạng thái yêu cầu. Gói đăng ký chỉ được kích hoạt sau khi quản trị viên kiểm tra và phê duyệt." },
        ],
        note: "Nếu bị từ chối, đọc lý do, sửa thông tin hoặc biên lai và gửi lại yêu cầu.",
      },
      faq: {
        title: "Câu hỏi thường gặp và an toàn",
        intro: "Hãy thận trọng khi liên hệ và giao dịch với người bán.",
        steps: [
          { title: "KhLan có nhận tiền mua xe không?", description: "Không. Người mua và người bán tự thỏa thuận và thanh toán trực tiếp. KHQR chỉ dành cho phí đăng ký." },
          { title: "Khi nào gói đăng ký có hiệu lực?", description: "Sau khi bạn gửi biên lai và quản trị viên phê duyệt yêu cầu thanh toán." },
          { title: "Làm sao tránh lừa đảo?", description: "Gặp ở nơi an toàn, tự kiểm tra xe và giấy tờ, không gửi tiền trước khi xác minh." },
        ],
      },
    },
  },
  zh: {
    badge: "KhLan 使用指南",
    title: "如何使用 KhLan 车辆交易平台",
    subtitle: "了解如何寻找车辆、联系卖家、发布车辆或配件，以及安全支付订阅费用。",
    browse: "浏览车辆",
    create: "发布商品",
    tabs: { buyer: "1. 买家指南", seller: "2. 发布商品", dealer: "3. 经销商", payments: "4. 付款", faq: "5. 安全与常见问题" },
    sections: {
      buyer: {
        title: "查找并购买车辆",
        intro: "您可以公开浏览商品。车辆购买由买家与卖家直接协商并完成付款。",
        steps: [
          { title: "搜索和筛选", description: "选择汽车、摩托车或配件，并按品牌、价格、年份和地点筛选。", image: "/images/guide/buyer-browse.jpg", alt: "带有筛选条件的车辆浏览页面", caption: "先选择类别，再使用筛选条件查找合适的商品。" },
          { title: "查看车辆详情", description: "查看描述、照片、价格和卖家信息。AI 报告（如有）仅供参考，并不保证车辆状况。", image: "/images/guide/buyer-vehicle-detail.jpg", alt: "车辆详情和卖家信息页面", caption: "联系卖家前，请仔细查看车辆信息和照片。" },
          { title: "联系卖家并预约", description: "询问车辆状况、证件和看车时间。请亲自查看车辆并核实相关证件。", image: "/images/guide/buyer-contact-seller.jpg", alt: "联系卖家对话框", caption: "通过聊天咨询并商定看车时间。" },
          { title: "直接完成交易", description: "付款前检查车辆和证件。KhLan 不收取车辆购买款；网站上的 KHQR 仅用于支付订阅费。", image: "/images/guide/buyer-request-viewing.jpg", alt: "预约看车说明", caption: "与卖家见面，检查车辆，并直接完成交易。" },
        ],
        note: "在核实卖家和车辆之前，请勿支付定金。",
      },
      seller: {
        title: "发布车辆或配件",
        intro: "请使用具有有效订阅或免费试用资格的卖家账户登录，然后按步骤填写。",
        steps: [
          { title: "填写商品信息", description: "选择汽车、摩托车或配件，并准确填写品牌、型号、年份、状况和描述。", image: "/images/guide/seller-listing-details.jpg", alt: "填写商品信息步骤", caption: "第 1 步：选择商品类型并填写所需信息。" },
          { title: "添加照片", description: "上传清晰的实拍照片，包括外观、内饰、仪表和任何瑕疵。", image: "/images/guide/seller-add-photos.jpg", alt: "为商品添加照片步骤", caption: "第 2 步：上传照片并选择封面图。" },
          { title: "设置价格并发布", description: "填写价格和地点，检查信息后发布。及时回复买家并安排线下看车。", image: "/images/guide/seller-set-price.jpg", alt: "设置价格和地点步骤", caption: "第 3 步：发布前再次确认价格和地点。" },
        ],
        note: "买家和卖家直接进行车辆交易。",
      },
      dealer: {
        title: "经销商指南",
        intro: "经销商账户可管理多个商品和展厅信息。",
        steps: [
          { title: "管理库存", description: "为每辆车单独创建商品，并及时更新价格和车辆状况。" },
          { title: "添加分店", description: "设置展厅地点，并在发布车辆时选择对应分店。" },
          { title: "跟进咨询", description: "定期查看买家消息并安排看车时间。" },
        ],
      },
      payments: {
        title: "支付订阅费用",
        intro: "KhLan 的 KHQR 仅用于卖家订阅付款。买家无需向 KhLan 支付车辆购买款。",
        steps: [
          { title: "选择方案", description: "打开订阅页面，选择合适的方案并确认应付金额。" },
          { title: "扫描 KHQR", description: "打开银行应用扫描页面上的 KHQR，并在确认前核对收款方和金额。" },
          { title: "上传收据", description: "返回 KhLan，上传清晰的付款收据，填写所需交易信息并提交申请。" },
          { title: "等待管理员审核", description: "查看申请状态。管理员检查并批准付款后，订阅才会生效。" },
        ],
        note: "如果申请被拒绝，请查看原因，修正信息或收据后重新提交。",
      },
      faq: {
        title: "常见问题与安全提示",
        intro: "与卖家联系和交易时请保持谨慎。",
        steps: [
          { title: "KhLan 会收取车辆款吗？", description: "不会。买家和卖家直接协商并付款。KHQR 仅用于支付订阅费。" },
          { title: "订阅何时生效？", description: "提交收据后，管理员审核并批准付款，订阅才会生效。" },
          { title: "如何防范诈骗？", description: "选择安全地点见面，亲自检查车辆和证件，并在核实前不要转账。" },
        ],
      },
    },
  },
};

function GuideScreenshot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <Image
        src={src}
        alt={alt}
        width={1440}
        height={900}
        sizes="(max-width: 640px) 100vw, 850px"
        className="block h-auto w-full"
      />
      <figcaption className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 sm:px-4">
        {caption}
      </figcaption>
    </figure>
  );
}

export function GuideView({ initialTab = "buyer" }: GuideViewProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);

  const isKm = locale === "km";

  if (locale === "vi" || locale === "zh") {
    const copy = localizedGuide[locale];
    const tabs: GuideTab[] = ["buyer", "seller", "dealer", "payments", "faq"];
    const section = copy.sections[activeTab as GuideTab];

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
        <div className="bg-slate-950 text-white py-12 px-4 sm:px-6 border-b border-slate-800">
          <div className="max-w-5xl mx-auto text-center space-y-4">
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 text-xs font-semibold rounded-full">
              {copy.badge}
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">{copy.subtitle}</p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => navigate({ name: "browse" })} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5">
                <Search className="h-4 w-4 mr-2" />{copy.browse}
              </Button>
              <Button onClick={() => navigate({ name: "sell" })} variant="outline" className="border-slate-700 bg-slate-900/60 text-white hover:bg-slate-800 font-semibold px-5">
                <Tag className="h-4 w-4 mr-2 text-amber-400" />{copy.create}
              </Button>
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
          <nav aria-label={copy.badge} className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                aria-current={activeTab === tab ? "page" : undefined}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors",
                  activeTab === tab
                    ? "border-amber-500 bg-amber-500 text-slate-950"
                    : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
                )}
              >
                {copy.tabs[tab]}
              </button>
            ))}
          </nav>
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 bg-amber-50/50">
              <CardTitle className="text-xl">{section.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{section.intro}</CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-5">
              <ol className="space-y-5">
                {section.steps.map((step, index) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900 font-bold text-sm">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className="font-bold text-slate-900">{step.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                      {step.image && step.alt && step.caption && (
                        <GuideScreenshot src={step.image} alt={step.alt} caption={step.caption} />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {section.note && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
                  {section.note}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-sky-500/10 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto text-center space-y-4">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 text-xs font-semibold rounded-full inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {isKm ? "មគ្គុទ្ទេសក៍ផ្លូវការរបស់ប្រព័ន្ធ KhLan" : "KhLan Official Platform Manual"}
          </Badge>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
            {isKm ? (
              <>
                របៀបប្រើប្រាស់ប្រព័ន្ធ <span className="text-amber-400">ឡាន (KhLan)</span>
              </>
            ) : (
              <>
                How to Use the <span className="text-amber-400">KhLan</span> Marketplace
              </>
            )}
          </h1>

          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">
            {isKm
              ? "ស្វែងយល់ពីរបៀបរុករក ពិនិត្យព័ត៌មានយានយន្ត ទាក់ទងអ្នកលក់ ចុះផ្សាយលក់ និងបង់ថ្លៃគម្រោងជាវតាម KHQR។"
              : "Learn how to find vehicles, review listing information, contact sellers, post listings, and pay for a seller subscription by KHQR."}
          </p>

          {/* Quick CTA actions */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => navigate({ name: "browse" })}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5"
            >
              <Search className="h-4 w-4 mr-2" />
              {isKm ? "រុករកឡានឥឡូវនេះ" : "Browse Marketplace"}
            </Button>
            <Button
              onClick={() => navigate({ name: "sell" })}
              variant="outline"
              className="border-slate-700 bg-slate-900/60 text-white hover:bg-slate-800 font-semibold px-5"
            >
              <Tag className="h-4 w-4 mr-2 text-amber-400" />
              {isKm ? "ចុះផ្សាយលក់យានយន្ត" : "Create a Listing"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          {/* Tab Navigation Pill Bar */}
          <div className="flex justify-center">
            <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs flex-wrap h-auto gap-1">
              <TabsTrigger
                value="buyer"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-semibold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5"
              >
                <Search className="h-4 w-4" />
                {isKm ? "១. របៀបទិញ (អ្នកទិញ)" : "1. Buyer Guide"}
              </TabsTrigger>
              <TabsTrigger
                value="seller"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-semibold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5"
              >
                <Tag className="h-4 w-4" />
                {isKm ? "២. របៀបលក់ (អ្នកលក់)" : "2. Seller & Posting"}
              </TabsTrigger>
              <TabsTrigger
                value="dealer"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-semibold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5"
              >
                <Building2 className="h-4 w-4" />
                {isKm ? "៣. គ្រប់គ្រងយានដ្ឋាន" : "3. Dealer Portal"}
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-semibold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5"
              >
                <QrCode className="h-4 w-4" />
                {isKm ? "៤. ការទូទាត់ KHQR" : "4. KHQR & Payments"}
              </TabsTrigger>
              <TabsTrigger
                value="faq"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950 font-semibold text-xs sm:text-sm py-2 px-3 sm:px-4 rounded-lg flex items-center gap-1.5"
              >
                <HelpCircle className="h-4 w-4" />
                {isKm ? "៥. សំណួរ និងសុវត្ថិភាព" : "5. FAQ & Safety"}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: BUYER GUIDE */}
          {/* ========================================================================= */}
          <TabsContent value="buyer" className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-amber-50/50 dark:bg-amber-950/10 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {isKm ? "ការស្វែងរក និងទិញយានយន្តនៅលើ KhLan" : "Finding & Buying Vehicles on KhLan"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "ជំហានងាយៗចំនួន ៤ ដើម្បីស្វែងរកឡាន ម៉ូតូ ឬគ្រឿងបន្លាស់ដែលត្រូវចិត្ត និងមានសុវត្ថិភាពខ្ពស់"
                        : "4 simple steps to browse, inspect, and connect with verified vehicle sellers safely"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Step 1 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-sm">
                    1
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      {isKm ? "រុករក និងប្រើប្រាស់តម្រងស្វែងរក (Smart Filtering)" : "Browse with Multi-Parameter Search"}
                      <Badge variant="outline" className="text-xs font-normal">
                        {isKm ? "ឥតគិតថ្លៃ" : "Free"}
                      </Badge>
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "ចូលទៅកាន់ផ្ទាំង «រុករកឡាន (Browse)» ដើម្បីជ្រើសរើសតាមប្រភេទយានយន្ត (រថយន្ត, ម៉ូតូ, គ្រឿងបន្លាស់), ម៉ាក (Toyota, Lexus, Ford, Honda...), ឆ្នាំផលិត, កម្រិតតម្លៃគិតជាដុល្លារ ($), ប្រភេទប្រអប់លេខ (Auto/Manual), និងទីតាំងខេត្ត/រាជធានី។"
                        : "Navigate to the 'Browse' section to filter by vehicle category (Cars, Motorcycles, Spare Parts), Make (Toyota, Lexus, Ford, Honda...), Year range, Price (USD), Transmission, Fuel type, and Location (Phnom Penh, Siem Reap, etc.)."}
                    </p>
                    <GuideScreenshot
                      src="/images/guide/buyer-browse.jpg"
                      alt={isKm
                        ? "រូបថតអេក្រង់ទំព័ររុករកដែលមានប្រភេទយានយន្ត តម្រង និងបញ្ជីលក់"
                        : "Marketplace browse screen showing vehicle categories, filters, and listing cards"}
                      caption={isKm
                        ? "ជ្រើសប្រភេទយានយន្ត និងប្រើតម្រង ដើម្បីរកមើលបញ្ជីដែលសមនឹងអ្នក។"
                        : "Choose a vehicle category and use the filters to find listings that match what you want."}
                    />
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold text-sm">
                    2
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-teal-600" />
                      {isKm ? "ត្រួតពិនិត្យរបាយការណ៍ AI (AI Inspection Report)" : "Review the AI Vehicle Inspection Report"}
                      <Badge className="bg-teal-600 text-white text-[10px]">
                        {isKm ? "លក្ខណៈពិសេស" : "Exclusive"}
                      </Badge>
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "នៅលើទំព័រលម្អិតនៃយានយន្តនីមួយៗ ចុចលើ «របាយការណ៍ AI (AI Report)»។ ប្រព័ន្ធនឹងបង្ហាញពិន្ទុទំនុកចិត្ត (Overall Confidence Score 0-100%), ការផ្ទៀងផ្ទាត់លេខតួ/លេខកូដ VIN, ភាពត្រឹមត្រូវនៃកុងទ័រគីឡូម៉ែត្រ (Odometer), កំណត់ត្រាគ្រោះថ្នាក់, និងការប្រៀបធៀបតម្លៃជាមួយទីផ្សារជាក់ស្តែងនៅកម្ពុជា។"
                        : "Open a listing and review its AI vehicle report when available. If no report is ready, use Generate AI report where offered. Check the evidence and unknowns alongside the vehicle details; an AI report is not a guarantee."}
                    </p>
                    <GuideScreenshot
                      src="/images/guide/buyer-vehicle-detail.jpg"
                      alt={isKm
                        ? "រូបថតអេក្រង់ព័ត៌មានលម្អិតរថយន្ត បង្ហាញតម្លៃ អ្នកលក់ និងកាតរបាយការណ៍ AI"
                        : "Vehicle detail screen showing the price, seller information, and AI vehicle report card"}
                      caption={isKm
                        ? "ពិនិត្យតម្លៃ ព័ត៌មានអ្នកលក់ និងកាតរបាយការណ៍ AI មុនពេលទាក់ទង។"
                        : "Review the price, seller information, and AI report card before contacting the seller."}
                    />
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 font-bold text-sm">
                    3
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-sky-600" />
                      {isKm ? "ជជែកផ្ទាល់ជាមួយអ្នកលក់ (Strict 2-Party Chat)" : "Direct 2-Party Verified Chat"}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "ចុច «ទាក់ទងអ្នកលក់ (Contact Seller)» ដើម្បីជជែកសួរព័ត៌មានបន្ថែម ចរចាតម្លៃ ឬសុំមើលរូបភាពបន្ថែម។ ប្រព័ន្ធផ្ញើសាររបស់ KhLan ធានាការរក្សាការសម្ងាត់ខ្ពស់រវាងអ្នកទិញ និងអ្នកលក់ ដោយគ្មានការជ្រៀតជ្រែក ឬក្លែងបន្លំពីភាគីទីបីឡើយ។"
                        : "Click 'Contact Seller' to chat directly with the owner or verified dealership. Conversations are completely private, real-time, and backed by anti-fraud safety advisories warning against upfront wire transfer deposits."}
                    </p>
                    <GuideScreenshot
                      src="/images/guide/buyer-contact-seller.jpg"
                      alt={isKm
                        ? "ប្រអប់សារទាក់ទងអ្នកលក់ មានសារសុវត្ថិភាព និងប្រអប់សរសេរសារ"
                        : "Contact seller dialog with a safety reminder, suggested questions, and a message field"}
                      caption={isKm
                        ? "សួរអំពីស្ថានភាព រូបភាព និងការមើលយានយន្ត។ ការជជែកត្រូវការគណនី។"
                        : "Ask about the condition, photos, or viewing time. You need an account to start a conversation."}
                    />
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm">
                    4
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-emerald-600" />
                      {isKm ? "ណាត់ជួប និងមើលយានយន្តជាក់ស្តែង (Viewing & Test Drive)" : "Schedule Test Drive & Physical Viewing"}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "កក់ការណាត់ជួបតាមរយៈប្រព័ន្ធ ឬតាមទូរស័ព្ទ។ សូមពិនិត្យមើលសៀវភៅសម្គាល់យានយន្ត (កាតគ្រី), លេខតួ និងស្ថានភាពម៉ាស៊ីនដោយផ្ទាល់ មុននឹងសម្រេចចិត្តផ្ទេរប្រាក់កក់ ឬទូទាត់ប្រាក់ពេញលេញ។"
                        : "Book an appointment or test drive. Always verify the physical registration card (កាតគ្រី), chassis VIN stamp, and mechanical condition in person before releasing any escrow deposit or final payment."}
                    </p>
                    <GuideScreenshot
                      src="/images/guide/buyer-request-viewing.jpg"
                      alt={isKm
                        ? "ប្រអប់ស្នើសុំសាកល្បងបើកបរ មានកាលបរិច្ឆេទ ពេលវេលា និងកំណត់ចំណាំ"
                        : "Test drive request dialog with date, time, and optional notes"}
                      caption={isKm
                        ? "ជ្រើសកាលបរិច្ឆេទ និងពេលវេលា បន្ថែមកំណត់ចំណាំ ហើយផ្ញើសំណើ។"
                        : "Choose a date and time, add an optional note, and send the request when ready."}
                    />
                  </div>
                </div>

                {/* Call to Action Box */}
                <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 p-4 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="font-bold text-slate-900">
                      {isKm ? "ត្រៀមខ្លួនស្វែងរកឡានក្នុងក្តីស្រមៃហើយឬនៅ?" : "Ready to find your next vehicle?"}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {isKm ? "រថយន្ត និងម៉ូតូជាច្រើនរយគ្រឿងកំពុងរង់ចាំលោកអ្នក" : "Browse dozens of curated, inspected listings right now"}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate({ name: "browse" })}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    {isKm ? "រុករកទីផ្សារឥឡូវនេះ" : "Browse Listings Now"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 2: SELLER GUIDE & CREATE LISTING */}
          {/* ========================================================================= */}
          <TabsContent value="seller" className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-sky-50/50 dark:bg-sky-950/10 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold">
                    <Tag className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {isKm ? "របៀបចុះផ្សាយលក់យានយន្តរបស់អ្នក (Seller Guide)" : "How to Create a Listing & Sell on KhLan"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "ការចុះផ្សាយលក់រថយន្ត ម៉ូតូ ឬគ្រឿងបន្លាស់ យ៉ាងរហ័ស ជាមួយការសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃ"
                        : "Create a listing with an active subscription or free trial. Subscription access starts after payment approval."}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Step 1 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 font-bold text-sm">
                    1
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      {isKm ? "ចុះឈ្មោះ និងទទួលបានការសាកល្បងឥតគិតថ្លៃ (14-Day Free Trial)" : "Sign Up & Get 14-Day Free Trial"}
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        {isKm ? "ឥតគិតថ្លៃ" : "Free"}
                      </Badge>
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "ចុះឈ្មោះគណនីរបស់អ្នកដោយប្រើលេខទូរស័ព្ទកម្ពុជា (+855)។ គណនីអ្នកលក់ថ្មីទាំងអស់ទទួលបានការសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃភ្លាមៗ ដើម្បីចុះផ្សាយលក់យានយន្តដោយមិនចាំបាច់បង់ប្រាក់ជាមុនឡើយ។"
                        : "Register with your Cambodian mobile number (+855). Every new private seller account receives an instant 14-day free trial to post listings without paying upfront."}
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 font-bold text-sm">
                    2
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-sky-600" />
                      {isKm ? "ជ្រើសរើសគម្រោងជាវ (Seller Subscription)" : "Choose a Seller Plan"}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "នៅពេលចប់ការសាកល្បង សូមជ្រើសរើសគម្រោងជាវដែលសមស្រប។ ស្កេន KHQR បង់ប្រាក់ បង្ហោះបង្កាន់ដៃ និងដាក់សំណើ។ គម្រោងជាវនឹងចាប់ផ្ដើមបន្ទាប់ពីអ្នកគ្រប់គ្រងពិនិត្យ និងអនុម័ត។"
                        : "When your trial ends, choose a subscription plan. Pay by KHQR, upload the receipt, and submit your request. Your subscription starts after an administrator reviews and approves the payment."}
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-sm">
                    3
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Upload className="h-4 w-4 text-amber-600" />
                      {isKm ? "បំពេញព័ត៌មាន និងបង្ហោះរូបភាព (Step-by-Step Listing Creation)" : "Fill Specifications & Upload Photos"}
                    </h3>
                    <div className="text-sm text-slate-600 space-y-2">
                      <p>
                        {isKm
                          ? "ចុចលើប៊ូតុង «លក់ឡាន (Sell)» ហើយបំពេញព័ត៌មានតាមជំហានទាំង ៣ ខាងក្រោម៖"
                          : "Click 'Sell your car' in the navigation bar and follow the three-step listing wizard:"}
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-700">
                        <li>
                          <strong>{isKm ? "ព័ត៌មានគោល (Basic Specs):" : "Basic Specs:"}</strong>{" "}
                          {isKm ? "ជ្រើសរើសប្រភេទ (ឡាន, ម៉ូតូ, គ្រឿងបន្លាស់), ម៉ាក, ម៉ូឌែល, ឆ្នាំផលិត, និងពណ៌។" : "Category (Car/Motor/Part), Make, Model, Year, Body type, Color."}
                        </li>
                        <li>
                          <strong>{isKm ? "ម៉ាស៊ីន និងការបើកបរ (Powertrain):" : "Powertrain:"}</strong>{" "}
                          {isKm ? "កម្លាំងម៉ាស៊ីន (cc), ប្រភេទប្រេង (សាំង, ម៉ាស៊ូត, Hybrid, EV), ប្រអប់លេខ (Auto/Manual)។" : "Engine capacity, Fuel type (Petrol, Diesel, Hybrid, EV), Transmission."}
                        </li>
                        <li>
                          <strong>{isKm ? "ឯកសារ និងស្លាកលេខ (Documents & Trust):" : "Documents & Trust:"}</strong>{" "}
                          {isKm ? "បញ្ជាក់ស្ថានភាពពន្ធ (ក្រដាសពន្ធ, ស្លាកលេខភ្នំពេញ/ខេត្ត), លេខតួ ៦ ខ្ទង់ចុងក្រោយ (VIN) ដើម្បីបង្កើនពិន្ទុ AI Report។" : "Tax status, plate registration, last 6 digits of VIN for high AI trust rating."}
                        </li>
                        <li>
                          <strong>{isKm ? "រូបភាពគុណភាពខ្ពស់ (High-Res Photos):" : "High-Resolution Photos:"}</strong>{" "}
                          {isKm ? "បង្ហោះរូបភាពខាងក្រៅជុំវិញ ខាងក្នុង កុងទ័រគីឡូ និងម៉ាស៊ីន ដើម្បីទាក់ទាញអ្នកទិញ។" : "Upload crisp exterior 360, interior cockpit, engine bay, and odometer photos."}
                        </li>
                      </ul>
                      <div className="space-y-4 pt-2">
                        <GuideScreenshot
                          src="/images/guide/seller-listing-details.jpg"
                          alt={isKm
                            ? "ជំហានព័ត៌មានយានយន្តក្នុងទម្រង់ចុះផ្សាយ បង្ហាញប្រភេទ ម៉ាក ម៉ូដែល ឆ្នាំ និងចម្ងាយ"
                            : "Listing wizard vehicle details step with category, make, model, year, and mileage fields"}
                          caption={isKm
                            ? "ជំហានទី ១៖ ជ្រើសប្រភេទរថយន្ត ម៉ូតូ ឬគ្រឿងបន្លាស់ រួចបញ្ចូលព័ត៌មានដែលត្រូវការ។"
                            : "Step 1: Choose cars, motorcycles, or spare parts, then enter the required item details."}
                        />
                        <GuideScreenshot
                          src="/images/guide/seller-add-photos.jpg"
                          alt={isKm
                            ? "ជំហានបង្ហោះរូបភាពក្នុងទម្រង់ចុះផ្សាយ បង្ហាញរូបភាព និងលំដាប់រូបភាពគម្រប"
                            : "Listing wizard photo step showing uploaded images and the cover photo order"}
                          caption={isKm
                            ? "ជំហានទី ២៖ បង្ហោះ ឬបន្ថែមរូបភាព ហើយរៀបលំដាប់ ដើម្បីជ្រើសរូបភាពគម្រប។"
                            : "Step 2: Upload or add photos, then reorder them. The first photo is the cover image."}
                        />
                        <GuideScreenshot
                          src="/images/guide/seller-set-price.jpg"
                          alt={isKm
                            ? "ជំហានកំណត់តម្លៃ និងទីតាំងក្នុងទម្រង់ចុះផ្សាយ មុនបោះផ្សាយ"
                            : "Listing wizard price and location step before publishing"}
                          caption={isKm
                            ? "ជំហានទី ៣៖ កំណត់តម្លៃ និងទីតាំង ពិនិត្យព័ត៌មាន រួចចុច «បោះផ្សាយ»។"
                            : "Step 3: Set the price and location, review your details, and select Publish listing."}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm">
                    4
                  </span>
                  <div className="space-y-1.5 flex-1">
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-emerald-600" />
                      {isKm ? "ឆ្លើយតប និងគ្រប់គ្រងអតិថិជន (Lead Management)" : "Manage Inquiries & Receive Telegram Alerts"}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "នៅពេលមានអ្នកទិញផ្ញើសារ ឬស្នើសុំមើលរថយន្ត លោកអ្នកនឹងទទួលបានការជូនដំណឹងភ្លាមៗនៅលើទូរស័ព្ទ និង Telegram Bot ផ្លូវការ។ លោកអ្នកអាចជជែកចរចា និងបិទការលក់បានយ៉ាងរហ័ស។"
                        : "Get instant leads via our verified 2-party chat and connect our official Telegram Bot (@KhLanOfficialBot) to receive direct notification alerts whenever a potential buyer inquires."}
                    </p>
                  </div>
                </div>

                {/* Call to Action Box */}
                <div className="mt-6 rounded-xl bg-gradient-to-r from-sky-500/10 to-sky-500/5 p-4 border border-sky-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="font-bold text-slate-900">
                      {isKm ? "មានយានយន្ត ឬគ្រឿងបន្លាស់ចង់លក់មែនទេ?" : "Ready to sell your car or parts?"}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {isKm ? "ចុះផ្សាយថ្ងៃនេះ ទទួលបានការសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃភ្លាមៗ" : "Post your vehicle now and enjoy your 14-day free trial"}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate({ name: "sell" })}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold shrink-0"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {isKm ? "ចាប់ផ្តើមចុះផ្សាយលក់" : "Start Selling Now"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 3: DEALERSHIP PORTAL */}
          {/* ========================================================================= */}
          <TabsContent value="dealer" className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/10 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {isKm ? "ដំណោះស្រាយសម្រាប់យានដ្ឋាន និងហាងលក់រថយន្ត (Dealership Portal)" : "Dealership & Showroom Management System"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "គ្រប់គ្រងស្តុកយានយន្ត សាខាបង្ហាញ និងក្រុមការងារលក់របស់អ្នកនៅក្នុងផ្ទាំងគ្រប់គ្រងតែមួយ"
                        : "Multi-tenant inventory, multi-branch showrooms, staff RBAC permissions, and verified dealer checkmarks"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Feature 1 */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {isKm ? "គ្រប់គ្រងសាខា (Multi-Branch Management)" : "Multi-Branch Showroom Hub"}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isKm
                        ? "ចុះបញ្ជីទីតាំងយានដ្ឋានច្រើនសាខា (ភ្នំពេញ, សៀមរាប, បាត់ដំបង) ជាមួយលេខទូរស័ព្ទ និងផែនទីទីតាំងជាក់ស្តែង ដើម្បីឱ្យអ្នកទិញងាយស្រួលធ្វើដំណើរទៅទស្សនាផ្ទាល់។"
                        : "Showcase multiple physical branches with contact numbers, showroom photos, and GPS pins so customers can visit your lot directly."}
                    </p>
                  </div>

                  {/* Feature 2 */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Award className="h-4 w-4" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {isKm ? "សញ្ញាបញ្ជាក់យានដ្ឋាន (Verified Dealer Badge)" : "Verified Dealer Checkmark"}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isKm
                        ? "ដាក់ពាក្យស្នើសុំសញ្ញាធីក «យានដ្ឋានមានការបញ្ជាក់» ដោយភ្ជាប់ឯកសារអាជ្ញាប័ណ្ណអាជីវកម្ម ដើម្បីទទួលបានទំនុកចិត្តខ្ពស់បំផុត និងការមើលឃើញជាអាទិភាព។"
                        : "Upload business registration documents to earn the green Verified Dealer checkmark, giving your listings top placement and trust."}
                    </p>
                  </div>

                  {/* Feature 3 */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Users className="h-4 w-4" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {isKm ? "បែងចែកតួនាទីបុគ្គលិក (Staff Roles: Owner/Sales)" : "Staff Role Hierarchy & Permissions"}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isKm
                        ? "អញ្ជើញអ្នកគ្រប់គ្រង (Manager) និងបុគ្គលិកលក់ (Sales) ចូលរួមគ្រប់គ្រងស្តុកយានយន្ត ឆ្លើយតបសារអតិថិជន និងកត់ត្រាការលក់ដោយមានកំណត់ហេតុត្រឹមត្រូវ។"
                        : "Invite team members with role-based access: Owners manage billing and branches, while Sales staff answer inquiries and update inventory."}
                    </p>
                  </div>

                  {/* Feature 4 */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                        <FileCheck2 className="h-4 w-4" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {isKm ? "ស្ថានភាពស្តុក (Inventory Lifecycle)" : "Inventory Lifecycle Management"}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isKm
                        ? "គ្រប់គ្រងស្ថានភាពរថយន្តនីមួយៗបានយ៉ាងងាយស្រួល៖ សេចក្តីព្រាង (Draft), កំពុងផ្សាយ (Active), បានកក់ប្រាក់ (Reserved), ឬលក់រួចរាល់ (Sold)។"
                        : "Transition vehicles across statuses: Draft, Active, Reserved (deposit placed), or Sold with automatic history logging."}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="font-bold text-white">
                      {isKm ? "ចូលទៅកាន់ផ្ទាំងគ្រប់គ្រងយានដ្ឋាន" : "Access your Dealership Dashboard"}
                    </h4>
                    <p className="text-xs text-slate-400">
                      {isKm ? "មើលទិន្នន័យស្តុក អតិថិជនសក្តានុពល និងការកក់ទុកទាំងអស់" : "Monitor live inventory, sales inquiries, and branch branches"}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate({ name: "dashboard" })}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0"
                  >
                    {isKm ? "បើកផ្ទាំងគ្រប់គ្រង (Dashboard)" : "Go to Dashboard"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 4: SUBSCRIPTION PAYMENT GUIDE */}
          {/* ========================================================================= */}
          <TabsContent value="payments" className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/10 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {isKm ? "របៀបបង់ថ្លៃជាវតាម KHQR" : "How to Pay for Your Subscription"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "អនុវត្តតាមជំហានខាងក្រោម រួចរង់ចាំការបញ្ជាក់ការទូទាត់ជាវរបស់អ្នក។"
                        : "Follow these steps to pay for a seller subscription and check its status."}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
                  <strong>{isKm ? "សូមចំណាំ៖ " : "Please note: "}</strong>
                  {isKm
                    ? "ការបង់ប្រាក់ KHQR នៅទីនេះគឺសម្រាប់គម្រោងជាវអ្នកលក់ប៉ុណ្ណោះ។ ការទិញរថយន្តត្រូវទាក់ទង និងរៀបចំជាមួយអ្នកលក់ដោយផ្ទាល់។"
                    : "KHQR here is only for a seller subscription. Vehicle purchases are arranged directly with the seller."}
                </div>

                <ol className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      icon: <CreditCard className="h-5 w-5" />,
                      title: isKm ? "១. ជ្រើសរើសគម្រោងជាវ" : "1. Choose a subscription plan",
                      description: isKm
                        ? "ចូលទៅកាន់ផ្ទាំងគ្រប់គ្រង ឬទំព័រជាវ។ ជ្រើសរើសគម្រោង រយៈពេល និងរូបិយប័ណ្ណដែលអ្នកចង់បង់។"
                        : "Open your dashboard or subscription page. Choose a plan, billing period, and payment currency.",
                    },
                    {
                      icon: <QrCode className="h-5 w-5" />,
                      title: isKm ? "២. ស្កេនកូដ KHQR" : "2. Scan the KHQR code",
                      description: isKm
                        ? "បើកកម្មវិធីធនាគាររបស់អ្នក ស្កេនកូដ KHQR ដែលបង្ហាញលើអេក្រង់ ហើយពិនិត្យឈ្មោះអ្នកទទួល និងចំនួនប្រាក់ មុនពេលបញ្ជាក់ការផ្ទេរ។"
                        : "Open your banking app and scan the KHQR shown on the screen. Check the payee name and amount before confirming the transfer.",
                    },
                    {
                      icon: <Upload className="h-5 w-5" />,
                      title: isKm ? "៣. បង្ហោះបង្កាន់ដៃ និងផ្ញើសំណើ" : "3. Upload your receipt and submit",
                      description: isKm
                        ? "ត្រឡប់មក KhLan បង្ហោះរូបថតបង្កាន់ដៃច្បាស់លាស់។ ពិនិត្យលេខប្រតិបត្តិការ និងកាលបរិច្ឆេទដែលបានបង្ហាញ រួចចុចបញ្ជូនសំណើបង់ប្រាក់។"
                        : "Return to KhLan and upload a clear photo of your bank receipt. Check the transaction reference and payment date shown, then submit your payment request.",
                    },
                    {
                      icon: <Clock className="h-5 w-5" />,
                      title: isKm ? "៤. រង់ចាំការត្រួតពិនិត្យ" : "4. Wait for the payment review",
                      description: isKm
                        ? "សំណើរបស់អ្នកនឹងបង្ហាញថាកំពុងរង់ចាំការផ្ទៀងផ្ទាត់។ អ្នកគ្រប់គ្រងនឹងពិនិត្យព័ត៌មាន និងបង្កាន់ដៃ។ ប្រើប៊ូតុង «ពិនិត្យស្ថានភាព» ដើម្បីមើលលទ្ធផល។"
                        : "Your request will show as awaiting verification while an administrator checks the details and receipt. Use “Check Status” to see the result.",
                    },
                  ].map((step) => (
                    <li key={step.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        {step.icon}
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-900">{step.title}</h3>
                        <p className="text-xs leading-relaxed text-slate-600">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <p className="text-xs leading-relaxed text-emerald-950">
                      <strong>{isKm ? "បានអនុម័ត៖ " : "Approved: "}</strong>
                      {isKm
                        ? "គម្រោងជាវរបស់អ្នកនឹងដំណើរការបន្ទាប់ពីការបង់ប្រាក់ត្រូវបានអនុម័ត។"
                        : "Your subscription becomes active after the payment is approved."}
                    </p>
                  </div>
                  <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                    <p className="text-xs leading-relaxed text-rose-950">
                      <strong>{isKm ? "ត្រូវបានបដិសេធ៖ " : "Rejected: "}</strong>
                      {isKm
                        ? "អានមូលហេតុដែលបានបង្ហាញ កែតម្រូវព័ត៌មាន ឬបង្កាន់ដៃ ហើយដាក់សំណើម្តងទៀត។"
                        : "Read the reason shown, correct the details or receipt, and submit a new request."}
                    </p>
                  </div>
                </div>

                {/* Call to Action Box */}
                <div className="mt-6 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 p-4 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <h4 className="font-bold text-slate-900">
                      {isKm ? "ចង់ពិនិត្យមើលគម្រោងជាវរបស់អ្នក?" : "Want to review your subscription status?"}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {isKm ? "ចូលទៅកាន់ផ្ទាំងគ្រប់គ្រងគណនី និងការជាវរបស់អ្នក" : "Access your subscription plans and billing management"}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate({ name: "dashboard", tab: "subscription" })}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold shrink-0"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    {isKm ? "មើលគម្រោងជាវ (Subscription)" : "View Subscriptions"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 5: FAQ & SAFE TRANSACTION TIPS */}
          {/* ========================================================================= */}
          <TabsContent value="faq" className="space-y-6">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center font-bold">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {isKm ? "សំណួរដែលសួរញឹកញាប់ និងច្បាប់សុវត្ថិភាព" : "Frequently Asked Questions & Safety Advisory"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "គន្លឹះសំខាន់ៗដើម្បីទិញ និងលក់យានយន្តដោយសុវត្ថិភាព ជៀសវាងការចាញ់បោកប្រាស់"
                        : "Essential security guidelines and best practices for vehicle transactions in Cambodia"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Security Guidelines Box */}
                <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <h4>
                      {isKm ? "ច្បាប់មាសសម្រាប់សុវត្ថិភាពនៅកម្ពុជា" : "Golden Rules for Vehicle Safety in Cambodia"}
                    </h4>
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm text-amber-950">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        <strong>{isKm ? "កុំផ្ញើប្រាក់កក់មុនពេលឃើញរថយន្តជាក់ស្តែង៖" : "Never wire deposits in advance:"}</strong>{" "}
                        {isKm
                          ? "កុំផ្ទេរប្រាក់កក់តាមធនាគារទៅឱ្យជនដែលអ្នកមិនធ្លាប់ជួប ឬមិនទាន់បានពិនិត្យមើលរថយន្ត និងកាតគ្រីផ្ទាល់ភ្នែកឡើយ។"
                          : "Never send wire transfer deposits to private sellers before physically viewing the vehicle and its original registration card."}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        <strong>{isKm ? "ផ្ទៀងផ្ទាត់លេខតួ និងកាតគ្រី៖" : "Verify Chassis VIN & Title Book:"}</strong>{" "}
                        {isKm
                          ? "ពិនិត្យផ្ទៀងផ្ទាត់លេខតួ (Chassis/VIN) ដែលបោះត្រាលើតួរថយន្តជាក់ស្តែង ឱ្យដូចគ្នាបេះបិទនឹងសៀវភៅសម្គាល់យានយន្ត (កាតគ្រី)។"
                          : "Match the embossed physical chassis number stamp on the vehicle directly with the official MPWT registration card."}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        <strong>{isKm ? "ជួបគ្នានៅទីតាំងសាធារណៈ ឬយានដ្ឋានជាក់លាក់៖" : "Meet in Public or at Verified Showrooms:"}</strong>{" "}
                        {isKm
                          ? "ណាត់ជួបគ្នានៅទីតាំងសាធារណៈ ឬនៅយានដ្ឋានដែលមានអាសយដ្ឋានច្បាស់លាស់ក្នុងពេលថ្ងៃ។"
                          : "Conduct test drives and inspections in broad daylight at reputable garages or verified dealer showrooms."}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* FAQ Accordion */}
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="faq-1">
                    <AccordionTrigger className="text-left font-bold text-sm sm:text-base text-slate-900">
                      {isKm
                        ? "តើរបាយការណ៍ AI របស់ KhLan មានភាពត្រឹមត្រូវកម្រិតណា?"
                        : "How does the AI Vehicle Inspection Report work?"}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "របាយការណ៍ AI របស់ KhLan មិនមែនជាពិន្ទុទស្សន៍ទាយលេងៗនោះទេ ប៉ុន្តែជាការប្រមូលភស្តុតាងផ្ទៀងផ្ទាត់លើ ១០ ចំណុចសំខាន់ៗ រួមមាន ភាពពិតប្រាកដនៃលេខតួ VIN, កំណត់ត្រាគ្រោះថ្នាក់ដែលបានប្រកាស, កុងទ័រគីឡូម៉ែត្រធៀបនឹងអាយុកាលរថយន្ត, ស្ថានភាពពន្ធនាំចូល, និងការប្រៀបធៀបតម្លៃទីផ្សារជាក់ស្តែងនៅកម្ពុជា។"
                        : "KhLan's AI Inspection analyzes 10 specific evidence checkpoints: MPWT registration format, VIN chassis patterns, odometer deviation metrics, structural panel gaps in photos, and transacted sales benchmarks in Cambodia."}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="faq-2">
                    <AccordionTrigger className="text-left font-bold text-sm sm:text-base text-slate-900">
                      {isKm
                        ? "តើខ្ញុំអាចលក់ម៉ូតូ ឬគ្រឿងបន្លាស់នៅលើ KhLan បានដែរឬទេ?"
                        : "Can I sell motorcycles or spare parts on KhLan?"}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "បាទ/ចាស! KhLan គាំទ្រការចុះផ្សាយលក់រថយន្ត (Cars), ម៉ូតូគ្រប់ប្រភេទ (Motorcycles), និងគ្រឿងបន្លាស់យានយន្តសុទ្ធ ឬមួយទឹក (Spare Parts) យ៉ាងងាយស្រួល។"
                        : "Yes! KhLan fully supports 3 distinct listing categories: Cars (Sedan, SUV, Pickup), Motorcycles (Honda Dream, Scoopy, Sport, Cub), and Spare Parts (Tires, Brakes, Hybrid Batteries, Engine Oils)."}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="faq-3">
                    <AccordionTrigger className="text-left font-bold text-sm sm:text-base text-slate-900">
                      {isKm
                        ? "តើការសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃដំណើរការយ៉ាងដូចម្តេច?"
                        : "How does the 14-day free trial work for new sellers?"}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "នៅពេលលោកអ្នកចុះឈ្មោះគណនីអ្នកលក់ថ្មី ប្រព័ន្ធនឹងផ្តល់សិទ្ធិចុះផ្សាយលក់ដោយឥតគិតថ្លៃរយៈពេល ១៤ ថ្ងៃភ្លាមៗ ដោយមិនទាមទារកាតធនាគារឡើយ។ លោកអ្នកអាចសាកល្បងចុះផ្សាយ និងទទួលសារពីអ្នកទិញពិតប្រាកដ។"
                        : "Every newly registered seller receives 14 days of complimentary listing privileges immediately upon account creation. No credit card or upfront deposit is required."}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="faq-4">
                    <AccordionTrigger className="text-left font-bold text-sm sm:text-base text-slate-900">
                      {isKm
                        ? "តើការទូទាត់តាម KHQR Bakong មានសុវត្ថិភាពកម្រិតណា?"
                        : "Is NBC Bakong KHQR payment safe?"}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-600 leading-relaxed">
                      {isKm
                        ? "បង់ប្រាក់តាមកម្មវិធីធនាគាររបស់អ្នក ហើយពិនិត្យឈ្មោះអ្នកទទួល និងចំនួនប្រាក់មុនពេលបញ្ជាក់។ បន្ទាប់មក សូមបង្ហោះបង្កាន់ដៃក្នុង KhLan ហើយរង់ចាំអ្នកគ្រប់គ្រងពិនិត្យ។"
                        : "Pay using your banking app and verify the payee and amount before confirming. Then upload your receipt in KhLan and wait for an administrator to review it."}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
