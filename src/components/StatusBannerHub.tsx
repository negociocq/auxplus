import { UniplayFootballBanners } from "@/components/UniplayFootballBanners";
import { InstagramBannerAutomation } from "@/components/InstagramBannerAutomation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function StatusBannerHub() {
  return <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold">Banners</h3>
      <p className="mt-1 text-sm text-muted-foreground">Escolha a categoria para visualizar imagens e configurar as postagens.</p>
    </div>
    <Tabs defaultValue="games" className="space-y-4">
      <TabsList aria-label="Categorias de banners" className="grid w-full grid-cols-2 sm:w-fit">
        <TabsTrigger value="games">Jogos</TabsTrigger>
        <TabsTrigger value="editorial">Filmes e séries</TabsTrigger>
      </TabsList>
      <TabsContent value="games" className="space-y-4">
        <InstagramBannerAutomation category="games" />
        <UniplayFootballBanners />
      </TabsContent>
      <TabsContent value="editorial" className="space-y-4">
        <InstagramBannerAutomation category="editorial" />
      </TabsContent>
    </Tabs>
  </div>;
}
