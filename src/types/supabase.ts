// TypeScript types generated from Supabase schema
// Based on mobile app schema (specs/001-glotian-mvp-1/data-model.md)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          subscription_tier: "free" | "pro";
          storage_quota: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["users"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: never[];
      };
      learning_notes: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          original_text: string;
          translated_text: string;
          source_language: string;
          target_language: string;
          grammar_explanation: string | null;
          alternative_expressions: Json;
          source_type: Enums<"source_type">;
          source_url: string | null;
          attached_image_url: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["learning_notes"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["learning_notes"]["Insert"]
        >;
        Relationships: never[];
      };
      flashcard_decks: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          language: string;
          card_count: number;
          total_study_time_seconds: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["flashcard_decks"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["flashcard_decks"]["Insert"]
        >;
        Relationships: never[];
      };
      flashcards: {
        Row: {
          id: string;
          user_id: string;
          deck_id: string;
          source_note_id: string | null;
          term: string;
          definition: string;
          part_of_speech: string | null;
          example_sentences: string[];
          language: string;
          difficulty_level: "easy" | "medium" | "hard";
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["flashcards"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["flashcards"]["Insert"]>;
        Relationships: never[];
      };
      study_progress: {
        Row: {
          id: string;
          user_id: string;
          flashcard_id: string;
          interval_days: number;
          ease_factor: number;
          repetitions: number;
          next_review_at: string;
          total_reviews: number;
          correct_reviews: number;
          last_reviewed_at: string | null;
          status: "new" | "learning" | "review" | "relearning";
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["study_progress"]["Row"],
          "id" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["study_progress"]["Insert"]
        >;
        Relationships: never[];
      };
      study_sessions: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          cards_reviewed: number;
          correct_count: number;
          total_time_seconds: number;
        };
        Insert: Omit<
          Database["public"]["Tables"]["study_sessions"]["Row"],
          "id"
        >;
        Update: Partial<
          Database["public"]["Tables"]["study_sessions"]["Insert"]
        >;
        Relationships: never[];
      };
      reviews: {
        Row: {
          id: string;
          user_id: string;
          flashcard_id: string;
          rating: 1 | 2 | 3 | 4;
          time_taken_seconds: number;
          reviewed_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["reviews"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: never[];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          ui_language: string;
          learning_languages: string[];
          daily_goal_minutes: number;
          srs_algorithm: "sm2" | "fsrs-lite";
          target_cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["user_preferences"]["Row"],
          "id" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["user_preferences"]["Insert"]
        >;
        Relationships: never[];
      };
      audio_content: {
        Row: {
          id: string;
          user_id: string;
          source_note_id: string;
          audio_url: string;
          duration_seconds: number;
          language: string;
          download_status: "pending" | "completed" | "failed";
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["audio_content"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["audio_content"]["Insert"]
        >;
        Relationships: never[];
      };
      user_achievements: {
        Row: {
          id: string;
          user_id: string;
          current_streak: number;
          longest_streak: number;
          total_xp: number;
          level: number;
          badges: string[];
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["user_achievements"]["Row"],
          "id" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["user_achievements"]["Insert"]
        >;
        Relationships: never[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      subscription_tier: "free" | "pro";
      source_type: "manual" | "image" | "voice" | "web" | "extension";
      difficulty_level: "easy" | "medium" | "hard";
      study_status: "new" | "learning" | "review" | "relearning";
      srs_algorithm: "sm2" | "fsrs-lite";
      cefr_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
    };
  };
}

// Helper types for table access
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

// Specific table types for convenience
export type User = Tables<"users">;
export type LearningNote = Tables<"learning_notes">;
export type FlashcardDeck = Tables<"flashcard_decks">;
export type Flashcard = Tables<"flashcards">;
export type StudyProgress = Tables<"study_progress">;
export type StudySession = Tables<"study_sessions">;
export type Review = Tables<"reviews">;
export type UserPreferences = Tables<"user_preferences">;
export type AudioContent = Tables<"audio_content">;
export type UserAchievements = Tables<"user_achievements">;

// Helper types for queries
export type NoteListItem = Pick<
  LearningNote,
  "id" | "title" | "original_text" | "tags" | "created_at" | "source_type"
>;

export type DueCard = {
  flashcard: Flashcard;
  progress: StudyProgress;
};

export type DeckWithStats = FlashcardDeck & {
  new_cards: number;
  due_cards: number;
  learning_cards: number;
};
