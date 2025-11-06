import { useState, useEffect, useCallback } from 'react';
import { quranApiService, type SantriSurah, type SantriAyah } from '../services/quran-api';

// Transform API data to our component format
export interface Ayah {
  number: number;
  arabic: string;
  translation: string;
  transliteration?: string;
}

export interface Surah {
  id: number;
  name: string;
  arabicName: string;
  englishName: string;
  revelationType: 'Meccan' | 'Medinan';
  numberOfAyahs: number;
  ayahs: Ayah[];
  description: string;
}

// Enhanced fallback data
const enhancedFallbackSurahs: Surah[] = [
  {
    id: 1,
    name: "Al-Fatihah",
    arabicName: "الفاتحة",
    englishName: "The Opening",
    revelationType: "Meccan",
    numberOfAyahs: 7,
    description: "Surat Al Faatihah (Pembukaan) yang diturunkan di Mekah dan terdiri dari 7 ayat adalah surat yang pertama-tama diturunkan dengan lengkap diantara surat-surat yang ada dalam Al Quran dan termasuk golongan surat Makkiyyah.",
    ayahs: [
      {
        number: 1,
        arabic: "بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ",
        translation: "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.",
        transliteration: "Bismillahi'r-rahmani'r-raheem"
      },
      {
        number: 2,
        arabic: "اَلْحَمْدُ لِلّٰهِ رَبِّ الْعٰلَمِيْنَۙ",
        translation: "Segala puji bagi Allah, Tuhan seluruh alam,",
        transliteration: "Alhamdu lillahi rabbi'l-alameen"
      },
      {
        number: 3,
        arabic: "الرَّحْمٰنِ الرَّحِيْمِۙ",
        translation: "Yang Maha Pengasih, Maha Penyayang,",
        transliteration: "Ar-rahmani'r-raheem"
      },
      {
        number: 4,
        arabic: "مٰلِكِ يَوْمِ الدِّيْنِۗ",
        translation: "Pemilik hari pembalasan.",
        transliteration: "Maliki yawmi'd-deen"
      },
      {
        number: 5,
        arabic: "اِيَّاكَ نَعْبُدُ وَاِيَّاكَ نَسْتَعِيْنُۗ",
        translation: "Hanya kepada Engkaulah kami menyembah dan hanya kepada Engkaulah kami mohon pertolongan.",
        transliteration: "Iyyaka na'budu wa iyyaka nasta'een"
      },
      {
        number: 6,
        arabic: "اِهْدِنَا الصِّرَاطَ الْمُسْتَقِيْمَ ۙ",
        translation: "Tunjukilah kami jalan yang lurus,",
        transliteration: "Ihdina's-sirata'l-mustaqeem"
      },
      {
        number: 7,
        arabic: "صِرَاطَ الَّذِيْنَ اَنْعَمْتَ عَلَيْهِمْ ەۙ غَيْرِ الْمَغْضُوْبِ عَلَيْهِمْ وَلَا الضَّاۤلِّيْنَ ࣖ",
        translation: "(yaitu) jalan orang-orang yang telah Engkau beri nikmat kepadanya; bukan (jalan) mereka yang dimurkai, dan bukan (pula jalan) mereka yang sesat.",
        transliteration: "Sirata'lladhina an'amta alayhim ghayri'l-maghdubi alayhim wa la'd-dalleen"
      }
    ]
  },
  {
    id: 2,
    name: "Al-Baqarah",
    arabicName: "البقرة",
    englishName: "The Cow",
    revelationType: "Medinan",
    numberOfAyahs: 286,
    description: "Surat Al Baqarah yang 286 ayat itu turun di Madinah yang sebahagian besar diturunkan pada permulaan tahun Hijrah, kecuali ayat 281 diturunkan di Mina pada Hajji wadaa'.",
    ayahs: []
  },
  {
    id: 3,
    name: "Ali 'Imran",
    arabicName: "آل عمران",
    englishName: "Family of Imran",
    revelationType: "Medinan",
    numberOfAyahs: 200,
    description: "Surat Ali 'Imran yang terdiri dari 200 ayat ini adalah surat Madaniyyah.",
    ayahs: []
  },
  {
    id: 112,
    name: "Al-Ikhlas",
    arabicName: "الإخلاص",
    englishName: "The Sincerity",
    revelationType: "Meccan",
    numberOfAyahs: 4,
    description: "Surat Al Ikhlas terdiri dari 4 ayat, termasuk golongan surat-surat Makkiyyah, diturunkan sesudah surat An Naas.",
    ayahs: [
      {
        number: 1,
        arabic: "قُلْ هُوَ اللّٰهُ اَحَدٌۚ",
        translation: "Katakanlah: \"Dia-lah Allah, Yang Maha Esa.",
        transliteration: "Qul huwa'llahu ahad"
      },
      {
        number: 2,
        arabic: "اَللّٰهُ الصَّمَدُۚ",
        translation: "Allah adalah Tuhan yang bergantung kepada-Nya segala sesuatu.",
        transliteration: "Allahu's-samad"
      },
      {
        number: 3,
        arabic: "لَمْ يَلِدْ وَلَمْ يُوْلَدْۙ",
        translation: "Dia tiada beranak dan tidak pula diperanakkan,",
        transliteration: "Lam yalid wa lam yoolad"
      },
      {
        number: 4,
        arabic: "وَلَمْ يَكُنْ لَّهٗ كُفُوًا اَحَدٌ ࣖ",
        translation: "dan tidak ada seorangpun yang setara dengan Dia\".",
        transliteration: "Wa lam yakun lahu kufuwan ahad"
      }
    ]
  },
  {
    id: 113,
    name: "Al-Falaq",
    arabicName: "الفلق",
    englishName: "The Daybreak",
    revelationType: "Meccan",
    numberOfAyahs: 5,
    description: "Surat Al Falaq terdiri dari 5 ayat, termasuk golongan surat-surat Makkiyyah, diturunkan sesudah surat Al Fiil.",
    ayahs: [
      {
        number: 1,
        arabic: "قُلْ اَعُوْذُ بِرَبِّ الْفَلَقِۙ",
        translation: "Katakanlah: \"Aku berlindung kepada Tuhan yang menguasai subuh,",
        transliteration: "Qul a'oodhu bi rabbi'l-falaq"
      },
      {
        number: 2,
        arabic: "مِنْ شَرِّ مَا خَلَقَۙ",
        translation: "dari kejahatan makhluk-Nya,",
        transliteration: "Min sharri ma khalaq"
      },
      {
        number: 3,
        arabic: "وَمِنْ شَرِّ غَاسِقٍ اِذَا وَقَبَۙ",
        translation: "dan dari kejahatan malam apabila telah gelap gulita,",
        transliteration: "Wa min sharri ghasiqin idha waqab"
      },
      {
        number: 4,
        arabic: "وَمِنْ شَرِّ النَّفّٰثٰتِ فِى الْعُقَدِۙ",
        translation: "dan dari kejahatan wanita-wanita tukang sihir yang menghembus pada buhul-buhul,",
        transliteration: "Wa min sharri'n-naffathati fi'l-uqad"
      },
      {
        number: 5,
        arabic: "وَمِنْ شَرِّ حَاسِدٍ اِذَا حَسَدَ ࣖ",
        translation: "dan dari kejahatan pendengki bila ia dengki\".",
        transliteration: "Wa min sharri hasidin idha hasad"
      }
    ]
  },
  {
    id: 114,
    name: "An-Nas",
    arabicName: "الناس",
    englishName: "Mankind",
    revelationType: "Meccan",
    numberOfAyahs: 6,
    description: "Surat An Naas terdiri dari 6 ayat, termasuk golongan surat-surat Makkiyyah, diturunkan sesudah surat Al Falaq.",
    ayahs: [
      {
        number: 1,
        arabic: "قُلْ اَعُوْذُ بِرَبِّ النَّاسِۙ",
        translation: "Katakanlah: \"Aku berlindung kepada Tuhan manusia.",
        transliteration: "Qul a'oodhu bi rabbi'n-nas"
      },
      {
        number: 2,
        arabic: "مَلِكِ النَّاسِۙ",
        translation: "Raja manusia.",
        transliteration: "Maliki'n-nas"
      },
      {
        number: 3,
        arabic: "اِلٰهِ النَّاسِۙ",
        translation: "Sembahan manusia.",
        transliteration: "Ilahi'n-nas"
      },
      {
        number: 4,
        arabic: "مِنْ شَرِّ الْوَسْوَاسِ ەۙ الْخَنَّاسِۖ",
        translation: "dari kejahatan (bisikan) syaitan yang biasa bersembunyi,",
        transliteration: "Min sharri'l-waswasi'l-khannas"
      },
      {
        number: 5,
        arabic: "الَّذِيْ يُوَسْوِسُ فِيْ صُدُوْرِ النَّاسِۙ",
        translation: "yang membisikkan (kejahatan) ke dalam dada manusia,",
        transliteration: "Alladhee yuwaswisu fee sudoori'n-nas"
      },
      {
        number: 6,
        arabic: "مِنَ الْجِنَّةِ وَالنَّاسِ ࣖ",
        translation: "dari golongan jin dan manusia\".",
        transliteration: "Mina'l-jinnati wa'n-nas"
      }
    ]
  }
];

// Helper function to clean HTML tags from transliteration
const cleanTransliteration = (text: string): string => {
  return text.replace(/<[^>]*>/g, '');
};

export function useQuranData() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'fallback'>('offline');

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const transformSantriSurah = useCallback((santriSurah: SantriSurah): Surah => {
    return {
      id: santriSurah.nomor,
      name: santriSurah.nama_latin,
      arabicName: santriSurah.nama,
      englishName: santriSurah.arti,
      revelationType: santriSurah.tempat_turun === 'mekah' ? 'Meccan' : 'Medinan',
      numberOfAyahs: santriSurah.jumlah_ayat,
      description: santriSurah.deskripsi.replace(/<[^>]*>/g, ''), // Remove HTML tags
      ayahs: []
    };
  }, []);

  const transformSantriAyahs = useCallback((santriAyahs: SantriAyah[]): Ayah[] => {
    return santriAyahs.map((ayah: SantriAyah) => ({
      number: ayah.nomor,
      arabic: ayah.ar,
      translation: ayah.idn,
      transliteration: cleanTransliteration(ayah.tr)
    }));
  }, []);

  const testApiConnection = useCallback(async () => {
    try {
      const isConnected = await quranApiService.testConnection();
      setApiStatus(isConnected ? 'online' : 'fallback');
      return isConnected;
    } catch (error) {
      setApiStatus('fallback');
      return false;
    }
  }, []);

  const loadSurahsList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Test API connection first
      await testApiConnection();

      if (!isOnline) {
        setSurahs(enhancedFallbackSurahs);
        setApiStatus('offline');
        return;
      }

      const santriSurahs = await quranApiService.getSurahsList();
      
      // Transform Santrikoding API data to our format
      const transformedSurahs: Surah[] = santriSurahs.map(transformSantriSurah);

      setSurahs(transformedSurahs);
      
      // Update API status based on whether we got real data or fallback
      if (santriSurahs.length > 10) { // If we have a good amount of data, likely from API
        setApiStatus('online');
      } else {
        setApiStatus('fallback');
      }
      
    } catch (err) {
      console.warn('Error loading surahs list, using fallback:', err);
      setError('Using offline data - some features may be limited');
      setSurahs(enhancedFallbackSurahs);
      setApiStatus('fallback');
    } finally {
      setLoading(false);
    }
  }, [isOnline, transformSantriSurah, testApiConnection]);

  const loadSurahContent = useCallback(async (surahNumber: number): Promise<Surah | null> => {
    try {
      if (!isOnline) {
        // Return fallback data if available
        const fallbackSurah = enhancedFallbackSurahs.find(s => s.id === surahNumber);
        return fallbackSurah || null;
      }

      const surahData = await quranApiService.getSurahWithContent(surahNumber);
      
      if (surahData) {
        const transformedSurah: Surah = {
          id: surahData.surah.nomor,
          name: surahData.surah.nama_latin,
          arabicName: surahData.surah.nama,
          englishName: surahData.surah.arti,
          revelationType: surahData.surah.tempat_turun === 'mekah' ? 'Meccan' : 'Medinan',
          numberOfAyahs: surahData.surah.jumlah_ayat,
          description: surahData.surah.deskripsi.replace(/<[^>]*>/g, ''), // Remove HTML tags
          ayahs: transformSantriAyahs(surahData.ayahs)
        };

        // Update the surah in our list with full content
        setSurahs(prev => prev.map(s => s.id === surahNumber ? transformedSurah : s));
        
        return transformedSurah;
      }
      
      return null;
    } catch (err) {
      console.warn(`Error loading surah ${surahNumber}, using fallback:`, err);
      
      // Try to return fallback data
      const fallbackSurah = enhancedFallbackSurahs.find(s => s.id === surahNumber);
      if (fallbackSurah) {
        return fallbackSurah;
      }
      
      throw new Error(`Failed to load Surah ${surahNumber}`);
    }
  }, [isOnline, transformSantriAyahs]);

  // Get random ayah for Verse of the Day
  const getRandomAyah = useCallback(async (): Promise<{ ayah: Ayah; surah: Surah } | null> => {
    try {
      if (!isOnline) {
        // Return random ayah from enhanced fallback data
        const surahs = enhancedFallbackSurahs.filter(s => s.ayahs.length > 0);
        const randomSurah = surahs[Math.floor(Math.random() * surahs.length)];
        const randomAyah = randomSurah.ayahs[Math.floor(Math.random() * randomSurah.ayahs.length)];
        return { ayah: randomAyah, surah: randomSurah };
      }

      const santriAyah = await quranApiService.getRandomAyah();
      if (santriAyah) {
        // Get the surah info for this ayah
        const surahData = await quranApiService.getSurahWithContent(santriAyah.surah);
        if (surahData) {
          const transformedSurah = transformSantriSurah(surahData.surah);
          const transformedAyah: Ayah = {
            number: santriAyah.nomor,
            arabic: santriAyah.ar,
            translation: santriAyah.idn,
            transliteration: cleanTransliteration(santriAyah.tr)
          };
          
          return { ayah: transformedAyah, surah: transformedSurah };
        }
      }

      // Fallback to enhanced local data
      const surahs = enhancedFallbackSurahs.filter(s => s.ayahs.length > 0);
      const randomSurah = surahs[Math.floor(Math.random() * surahs.length)];
      const randomAyah = randomSurah.ayahs[Math.floor(Math.random() * randomSurah.ayahs.length)];
      return { ayah: randomAyah, surah: randomSurah };
      
    } catch (err) {
      console.warn('Error getting random ayah, using fallback:', err);
      // Fallback to local data
      const surahs = enhancedFallbackSurahs.filter(s => s.ayahs.length > 0);
      const randomSurah = surahs[Math.floor(Math.random() * surahs.length)];
      const randomAyah = randomSurah.ayahs[Math.floor(Math.random() * randomSurah.ayahs.length)];
      return { ayah: randomAyah, surah: randomSurah };
    }
  }, [isOnline, transformSantriSurah]);

  // Load initial data
  useEffect(() => {
    loadSurahsList();
  }, [loadSurahsList]);

  const refetch = useCallback(() => {
    loadSurahsList();
  }, [loadSurahsList]);

  return {
    surahs,
    loading,
    error,
    isOnline,
    apiStatus,
    loadSurahContent,
    getRandomAyah,
    refetch,
    testApiConnection
  };
}