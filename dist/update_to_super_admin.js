"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
function updateUserToSuperAdmin(email) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log(`Updating ${email} to super_admin role...\n`);
        // First, get the user
        const { data: { users }, error: listError } = yield supabase.auth.admin.listUsers();
        if (listError) {
            console.error('Error listing users:', listError);
            return;
        }
        const user = users.find(u => u.email === email);
        if (!user) {
            console.error(`User ${email} not found!`);
            return;
        }
        console.log(`Found user: ${user.email}`);
        console.log(`Current role: ${(_a = user.user_metadata) === null || _a === void 0 ? void 0 : _a.role}`);
        console.log(`User ID: ${user.id}\n`);
        // Update the user's role to super_admin
        const { data, error } = yield supabase.auth.admin.updateUserById(user.id, {
            user_metadata: Object.assign(Object.assign({}, user.user_metadata), { role: 'super_admin' })
        });
        if (error) {
            console.error('Error updating user:', error);
            return;
        }
        console.log('✅ User updated successfully!');
        console.log(`New role: ${(_b = data.user.user_metadata) === null || _b === void 0 ? void 0 : _b.role}`);
        // Also update in profiles table
        const { error: profileError } = yield supabase
            .from('profiles')
            .update({ role: 'super_admin' })
            .eq('id', user.id);
        if (profileError) {
            console.error('Error updating profile:', profileError);
        }
        else {
            console.log('✅ Profile table updated successfully!');
        }
    });
}
// Update pedro@microatomo.pt to super_admin
updateUserToSuperAdmin('pedro@microatomo.pt').then(() => {
    console.log('\nDone!');
    process.exit(0);
});
