"use client";

import { useState } from "react";
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
  Eye,
  ChevronRight,
  Bike,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideViewProps {
  initialTab?: "buyer" | "seller" | "dealer" | "payments" | "faq";
}

export function GuideView({ initialTab = "buyer" }: GuideViewProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);

  const isKm = locale === "km";

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
              ? "ស្វែងយល់ពីរបៀបរុករក ត្រួតពិនិត្យរបាយការណ៍ AI ទាក់ទងអ្នកលក់ ទិញ-លក់រថយន្ត និងបង់ប្រាក់តាម KHQR Bakong ដោយសុវត្ថិភាព និងទំនុកចិត្តខ្ពស់បំផុត។"
              : "Learn how to discover verified vehicles, analyze AI inspection reports, contact sellers securely, post listings, and complete NBC Bakong KHQR payments with 100% confidence."}
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
                        : "On any vehicle page, click 'View AI Vehicle Report'. KhLan evaluates evidence across 10 critical checkpoints: title authenticity, odometer consistency, panel gap alignment, import origin, and fair valuation against recent Cambodian transactions."}
                    </p>
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
                      {isKm ? "របៀបចុះផ្សាយលក់យានយន្តរបស់អ្នក (Seller Guide)" : "How to Post & Sell on KhLan"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "ការចុះផ្សាយលក់រថយន្ត ម៉ូតូ ឬគ្រឿងបន្លាស់ យ៉ាងរហ័ស ជាមួយការសាកល្បងឥតគិតថ្លៃ ១៤ ថ្ងៃ"
                        : "Reach thousands of genuine Cambodian buyers with a 14-day free trial and instant KHQR listing activation"}
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
                        ? "នៅពេលចប់ការសាកល្បង លោកអ្នកអាចជ្រើសរើសគម្រោងជាវប្រចាំខែ ($15/ខែ) ឬប្រចាំឆ្នាំ ($150/ឆ្នាំ) ដើម្បីបន្តការចុះផ្សាយគ្មានដែនកំណត់។ ការបង់ប្រាក់អាចធ្វើបានតាមរយៈ NBC Bakong KHQR (ABA, ACLEDA, Wing...) ជាមួយការបើកដំណើរការដោយស្វ័យប្រវត្តិតែប៉ុន្មានវិនាទី។"
                        : "When your trial ends, subscribe to our Basic or Pro Seller plans. Pay seamlessly with NBC Bakong KHQR (ABA, ACLEDA, Wing, Canadia...) for instant, automated account activation."}
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
                          ? "ចុចលើប៊ូតុង «លក់ឡាន (Sell)» ហើយបំពេញទិន្នន័យតាមដំណាក់កាលដូចខាងក្រោម៖"
                          : "Click 'Sell a Car' in the navigation bar and follow our streamlined 4-step wizard:"}
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
          {/* TAB 4: KHQR PAYMENTS & VERIFICATION */}
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
                      {isKm ? "ការទូទាត់តាម NBC Bakong KHQR និងការផ្ទៀងផ្ទាត់" : "NBC Bakong KHQR & Automated Payment Verification"}
                    </CardTitle>
                    <CardDescription>
                      {isKm
                        ? "ការទូទាត់ថ្លៃសេវាជាវគម្រោងអ្នកលក់ តាមរយៈប្រព័ន្ធធនាគារកម្ពុជា ប្រកបដោយភាពរហ័ស និងសុវត្ថិភាពខ្ពស់"
                        : "Instant activation via NBC Bakong KHQR, Bank Slip OCR verification, and Telegram audit pipeline"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Method 1: Instant KHQR Scan */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                        A
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                        {isKm ? "ស្កេនទូទាត់ភ្លាមៗ (Instant Bakong KHQR Scan)" : "Instant KHQR Mobile Scan"}
                      </h3>
                    </div>
                    <Badge className="bg-emerald-600 text-white text-[10px]">
                      {isKm ? "បើកដំណើរការភ្លាមៗ" : "Instant Activation"}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {isKm
                      ? "បើកកម្មវិធីធនាគារចល័តណាមួយនៅកម្ពុជា (ដូចជា ABA Mobile, ACLEDA mobile, Wing Bank, Canadia Bank, Sathapana, Chip Mong...) ហើយស្កេនកូដ KHQR ដែលបង្ហាញលើអេក្រង់។ ប្រព័ន្ធនឹងផ្ទៀងផ្ទាត់ការទូទាត់ និងបើកដំណើរការគណនីជាវរបស់អ្នកដោយស្វ័យប្រវត្តិតែប៉ុន្មានវិនាទីប៉ុណ្ណោះ។"
                      : "Open any Cambodian banking app (ABA, ACLEDA, Wing, Canadia, Sathapana, etc.) and scan the dynamic KHQR code on your screen. The payment is verified instantly, activating your subscription without any manual wait."}
                  </p>
                </div>

                {/* Method 2: Manual Slip Upload with OCR */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-sky-100 text-sky-800 font-bold text-xs flex items-center justify-center">
                        B
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                        {isKm ? "បង្ហោះវិក្កយបត្រស្កេន AI (Bank Slip OCR Verification)" : "Bank Receipt Screenshot & OCR Match"}
                      </h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {isKm ? "ស្កេនស្វ័យប្រវត្តិ" : "OCR Matching"}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {isKm
                      ? "ប្រសិនបើលោកអ្នកបានផ្ទេរប្រាក់ដោយឡែក លោកអ្នកគ្រាន់តែថត ឬរក្សាទុកវិក្កយបត្រ (Screenshot/Slip) រួចបង្ហោះចូលទៅក្នុងប្រព័ន្ធ។ បច្ចេកវិទ្យា AI OCR នឹងអានទឹកប្រាក់ កាលបរិច្ឆេទ និងលេខកូដប្រតិបត្តិការ (Transaction ID) ដោយស្វ័យប្រវត្តិ។"
                      : "If you transferred from an external device, upload the bank payment slip screenshot. Our integrated OCR parser automatically reads the transaction reference, amount, currency, and date to match the subscription."}
                  </p>
                </div>

                {/* Method 3: Telegram Admin Review */}
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center">
                        C
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                        {isKm ? "ការត្រួតពិនិត្យដោយក្រុមការងារ Telegram (Admin Verification)" : "Telegram Audit & Interbank Verification"}
                      </h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {isKm ? "គាំទ្រគ្រប់ធនាគារ" : "All Banks"}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {isKm
                      ? "ករណីផ្ទេរប្រាក់អន្តរធនាគារ ឬមានបញ្ហាបច្ចេកទេស វិក្កយបត្រនឹងត្រូវបញ្ជូនទៅកាន់ប៉ុស្តិ៍ Telegram Admin ភ្លាមៗ។ ក្រុមការងារ KhLan នឹងត្រួតពិនិត្យ និងអនុម័តឱ្យលោកអ្នកក្នុងរយៈពេលមិនលើសពី ៥-១៥ នាទី។"
                      : "For interbank transfers or mismatched timestamps, submissions route to our secure Telegram audit channel. Admin moderators verify the transaction directly in the Telegram interface within minutes."}
                  </p>
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
                        ? "KHQR គឺជាស្តង់ដារកូដទូទាត់ជាតិរបស់ធនាគារជាតិនៃកម្ពុជា (NBC) ដែលគាំទ្រគ្រប់គ្រឹះស្ថានធនាគារ។ ប្រព័ន្ធ KhLan ប្រើប្រាស់ការផ្ទៀងផ្ទាត់កូដ Hash ស្វ័យប្រវត្តិ ធានាថារាល់ការបង់ប្រាក់ត្រូវបានទទួលស្គាល់ត្រឹមត្រូវ ១០០%។"
                        : "Bakong KHQR is the National Bank of Cambodia's official interoperable payment standard. All transactions are securely processed directly through Cambodian commercial banks with cryptographic verification."}
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
