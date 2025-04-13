import {Str} from "chanfana";
import {z} from "zod";

export const Purchase = z.object({
	name: Str({required: true}),
	price: z.number(),
	category: Str({required: true}),
	reason: Str({required: true}),
	needScore: z.number().min(1).max(10), // 1-10 rating of how much they need it
	hourlyWage: z.number().optional(),
	savingsGoal: z.object({
		name: Str({required: true}),
		current: z.number(),
		target: z.number(),
	}).optional()
});