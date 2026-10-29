import type { Locale } from './translations.ts';
export const authText = {
  welcome: [
    'ব্যবসার হিসাব, নিরাপদে শুরু করুন',
    'A safe start for your business',
  ],
  login: ['প্রবেশ করুন', 'Sign in'],
  signup: ['নতুন অ্যাকাউন্ট', 'Create account'],
  email: ['ইমেইল', 'Email'],
  password: ['পাসওয়ার্ড', 'Password'],
  showPassword: ['পাসওয়ার্ড দেখান', 'Show password'],
  hidePassword: ['পাসওয়ার্ড লুকান', 'Hide password'],
  confirmPassword: ['পাসওয়ার্ড আবার লিখুন', 'Retype password'],
  passwordMismatch: ['দুটি পাসওয়ার্ড মিলছে না।', 'Passwords do not match.'],
  newPassword: [
    'নতুন পাসওয়ার্ড (অন্তত ৮ অক্ষর)',
    'New password (at least 8 characters)',
  ],
  passwordHint: [
    'অন্তত ৮ অক্ষরের পাসওয়ার্ড দিন।',
    'Use a password with at least 8 characters.',
  ],
  displayName: ['আপনার নাম', 'Your name'],
  businessName: ['ব্যবসার নাম', 'Business name'],
  phone: ['যোগাযোগের মোবাইল (ঐচ্ছিক)', 'Contact phone (optional)'],
  address: ['ঠিকানা (ঐচ্ছিক)', 'Address (optional)'],
  forgot: ['পাসওয়ার্ড ভুলে গেছেন?', 'Forgot password?'],
  recovery: ['পাসওয়ার্ড পুনরুদ্ধার', 'Recover password'],
  requestReset: ['পুনরুদ্ধারের লিংক চাই', 'Request recovery link'],
  resetPassword: ['নতুন পাসওয়ার্ড সংরক্ষণ', 'Set new password'],
  loading: [
    'সেশন ও ব্যবসার তথ্য দেখা হচ্ছে…',
    'Checking your session and business…',
  ],
  waiting: ['অপেক্ষা করুন…', 'Please wait…'],
  verify: ['ইমেইল যাচাই করুন', 'Check your email'],
  verificationHint: [
    'ইমেইল নিশ্চিত করার প্রয়োজন হলে যাচাইয়ের লিংক খুলে তারপর প্রবেশ করুন। ইমেইল পৌঁছেছে কি না এখানে যাচাই করা যায়নি।',
    'If confirmation is required, open the verification link, then sign in. Email delivery has not been verified here.',
  ],
  resetRequested: [
    'অনুরোধ গ্রহণ হয়েছে। অ্যাকাউন্ট থাকলে ইমেইলে লিংক পেতে পারেন। ইমেইল পৌঁছেছে কি না নিশ্চিত নয়।',
    'Request accepted. If an eligible account exists, check its inbox. Delivery is not confirmed.',
  ],
  recoveryError: [
    'পুনরুদ্ধারের অনুরোধ পাঠানো যায়নি। সংযোগ বা ইমেইল পাঠানোর সীমা থাকতে পারে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    'The recovery request could not be completed. A connection or email rate limit may apply. Please wait before trying again.',
  ],
  resetDone: [
    'পাসওয়ার্ড হালনাগাদ হয়েছে। নতুন পাসওয়ার্ড দিয়ে প্রবেশ করুন।',
    'Password updated. Sign in with your new password.',
  ],
  onboarding: ['আপনার ব্যবসা যোগ করুন', 'Set up your business'],
  createBusiness: ['ব্যবসা তৈরি করুন', 'Create business'],
  retryOnboarding: ['আগের অনুরোধ আবার যাচাই করুন', 'Retry the same request'],
  uncertain: [
    'ফল নিশ্চিত করা যায়নি। একই তথ্য ও অনুরোধ দিয়ে আবার যাচাই করুন। নতুন করে আরেকটি ব্যবসা তৈরি করবেন না।',
    'The result is uncertain. Retry with the same details and request. Do not create another business.',
  ],
  ready: ['আপনার ব্যবসার অ্যাকাউন্ট', 'Your business account'],
  foundationOnly: [
    'অ্যাকাউন্ট ও ব্যবসার সংযোগ প্রস্তুত। দৈনন্দিন ব্যবসার কাজ এখনো চালু হয়নি।',
    'Your account and business connection are ready. Operational business modules are not available yet.',
  ],
  selectBusiness: ['কোন ব্যবসা খুলবেন?', 'Choose your business'],
  switchBusiness: ['ব্যবসা বদলান', 'Switch business'],
  noPermissions: [
    'কর্মীর অতিরিক্ত অনুমতি এখনো দেওয়া হয়নি।',
    'No optional Staff permissions have been granted.',
  ],
  owner: ['মালিক', 'Owner'],
  staff: ['কর্মী', 'Staff'],
  logout: ['বের হোন', 'Sign out'],
  retry: ['আবার চেষ্টা করুন', 'Try again'],
  error: [
    'সংযোগ বা সেশনে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
    'We could not complete the connection or session check. Please try again.',
  ],
  loginError: [
    'ইমেইল ও পাসওয়ার্ড যাচাই করুন। ইমেইল নিশ্চিত করা বা সংযোগ ঠিক করা লাগতে পারে।',
    'Check your email and password. Email confirmation or a working connection may be needed.',
  ],
  signupError: [
    'অ্যাকাউন্টের অনুরোধ শেষ হয়নি। তথ্য ও সংযোগ যাচাই করুন।',
    'The account request could not be completed. Check your details and connection.',
  ],
  logoutError: [
    'বের হওয়া নিশ্চিত হয়নি। আবার চেষ্টা করুন; এই পর্দায় ব্যবসার তথ্য বন্ধ রাখা হয়েছে।',
    'Sign-out could not be confirmed. Retry; business information is hidden here.',
  ],
  preferenceError: [
    'ভাষা এই পর্দায় বদলেছে, কিন্তু পছন্দ সংরক্ষণ হয়নি। আবার চেষ্টা করুন।',
    'The display language changed, but the preference was not saved. Please retry.',
  ],
  config: [
    'স্থানীয় সেবার সংযোগ প্রস্তুত নয়',
    'Local service connection is not configured',
  ],
  configHint: [
    'সংযোগ সেটআপ না হওয়া পর্যন্ত অ্যাকাউন্ট খোলা বা প্রবেশ করা যাবে না। নিচে আলাদা নমুনা দেখতে পারেন।',
    'Account access is unavailable until the connection is configured. You can open the separate sample below.',
  ],
  demo: ['আলাদা নমুনা দেখুন', 'Open separate sample'],
  demoBoundary: [
    'এটি আলাদা নমুনা। আপনার ব্যবসার তথ্য এখানে ব্যবহার হয় না।',
    'Separate sample. Your business data is not used here.',
  ],
  back: ['অ্যাকাউন্টে ফিরুন', 'Back to account'],
  savedLanguage: ['ভাষার পছন্দ', 'Language preference'],
  securityNote: [
    'মোবাইল নম্বর যোগাযোগের জন্য। প্রবেশ করতে ইমেইল ব্যবহার করুন।',
    'Phone is contact information. Use email to sign in.',
  ],
  recoveryRequired: [
    'ইমেইলের পুনরুদ্ধার লিংকটি এই ডিভাইসে খুলুন।',
    'Open your recovery email link on this device.',
  ],
} as const;
export type AuthTextKey = keyof typeof authText;
export function authLabel(locale: Locale, key: AuthTextKey): string {
  return authText[key][locale === 'bn' ? 0 : 1];
}
