import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  university_id: string;
  university_name?: string;
  major?: string;
  graduation_year?: number;
  education_level?: string;
  about_me?: string;
  avatar_url?: string;
  stripe_account?: string;
  created_at: string;
}

interface UserListings {
  hasListings: boolean;
  listingsCount: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userListings, setUserListings] = useState<UserListings | null>(null);
  const [loading, setLoading] = useState(true);
  const [listingsInitialized, setListingsInitialized] = useState(false);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchUserProfile(session.user.id);
        // Load cached listings immediately for instant UI
        const cachedLoaded = loadCachedUserListings(session.user.id);
        if (!cachedLoaded) {
          // If no cache, fetch immediately
          await fetchUserListings(session.user.id);
          setListingsInitialized(true);
        }
        // Always fetch fresh data in background if cache was loaded
        if (cachedLoaded) {
          fetchUserListings(session.user.id);
        }
      }
      
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        
              if (session?.user) {
          await fetchUserProfile(session.user.id);
          // Load cached listings immediately for instant UI
          const cachedLoaded = loadCachedUserListings(session.user.id);
          if (!cachedLoaded) {
            // If no cache, fetch immediately
            await fetchUserListings(session.user.id);
            setListingsInitialized(true);
          }
          // Always fetch fresh data in background if cache was loaded
          if (cachedLoaded) {
            fetchUserListings(session.user.id);
          }
        } else {
          setProfile(null);
          setUserListings(null);
          setListingsInitialized(false);
        }
        
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadCachedUserListings = (userId: string) => {
    try {
      const cached = localStorage.getItem(`userListings_${userId}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Use cached data if it's less than 30 minutes old
        if (Date.now() - data.timestamp < 30 * 60 * 1000) {
          setUserListings({
            hasListings: data.hasListings,
            listingsCount: data.listingsCount
          });
          setListingsInitialized(true);
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading cached user listings:', error);
    }
    return false;
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user:', userId);
      const response = await fetch(`http://localhost:4000/api/users/${userId}`);
      console.log('Profile response status:', response.status);
      
      if (response.ok) {
        const userData = await response.json();
        console.log('Profile found:', userData);
        
        // Also fetch university name
        if (userData.university_id) {
          const uniResponse = await fetch(`http://localhost:4000/api/universities/${userData.university_id}`);
          if (uniResponse.ok) {
            const uniData = await uniResponse.json();
            setProfile({
              ...userData,
              university_name: uniData.name
            });
          } else {
            setProfile(userData);
          }
        } else {
          setProfile(userData);
        }
      } else if (response.status === 404) {
        // Profile not found, create a basic one
        console.log('Profile not found, creating basic profile...');
        const basicProfile = {
          id: userId,
          name: user?.email?.split('@')[0] || 'User',
          email: user?.email || '',
          university_id: null,
          major: null,
          graduation_year: null,
          education_level: null,
          about_me: null,
          stripe_account: null
        };
        
        console.log('Creating profile with data:', basicProfile);
        
        const createResponse = await fetch('http://localhost:4000/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(basicProfile),
        });
        
        console.log('Create profile response status:', createResponse.status);
        
        if (createResponse.ok) {
          const newProfile = await createResponse.json();
          console.log('Profile created successfully:', newProfile);
          setProfile(newProfile);
        } else {
          const errorData = await createResponse.json();
          console.error('Failed to create profile:', errorData);
        }
      } else {
        console.error('Unexpected response status:', response.status);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchUserListings = async (userId: string) => {
    try {
      console.log('Fetching listings for user:', userId);
      const response = await fetch(`http://localhost:4000/api/listings?user_id=${userId}`);
      console.log('Listings response status:', response.status);
      
      if (response.ok) {
        const listings = await response.json();
        console.log('Listings found:', listings);
        const hasListings = listings.length > 0;
        const listingsData = {
          hasListings,
          listingsCount: listings.length
        };
        setUserListings(listingsData);
        // Store in localStorage for persistence
        localStorage.setItem(`userListings_${userId}`, JSON.stringify({
          ...listingsData,
          timestamp: Date.now()
        }));
      } else {
        console.log('No listings found or error');
        const defaultData = {
          hasListings: false,
          listingsCount: 0
        };
        setUserListings(defaultData);
        localStorage.setItem(`userListings_${userId}`, JSON.stringify({
          ...defaultData,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Error fetching user listings:', error);
      const defaultData = {
        hasListings: false,
        listingsCount: 0
      };
      setUserListings(defaultData);
      localStorage.setItem(`userListings_${userId}`, JSON.stringify({
        ...defaultData,
        timestamp: Date.now()
      }));
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshUserListings = async () => {
    if (user) {
      await fetchUserListings(user.id);
    }
  };

  return {
    user,
    profile,
    userListings,
    loading,
    signOut,
    refreshUserListings
  };
} 