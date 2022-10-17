/* eslint @typescript-eslint/consistent-type-definitions: ["error", "type"] */

type User = {
  // userId: string;
  name: string;
  // iconUrl: string;
};

/**
 * Response of `https://api.fanbox.cc/post.info?postId={postId}`.
 */
type Post = {
  body: {
    // id: string;
    title: string;
    coverImageUrl: string | null;
    // feeRequired: number;
    publishedDatetime: string;
    // updatedDatetime: string;
    // tags: string[];
    // excerpt: string;
    // isLiked: boolean;
    // likeCount: number;
    // commentCount: number;
    // restrictedFor: number;
    isRestricted: boolean;
    user: User;
    // creatorId: string;
    // hasAdultContent: boolean;
    // commentList: ?;
    // nextPost: ? | null;
    // prevPost: ? | null;
    // imageForShare: string;
  } & (PostImage | PostFile | PostArticle);
} | {
  error: string;
};

type PostBodyImage = {
  // id: string;
  // extension: string;
  // width: number;
  // height: number;
  originalUrl: string;
  // thumbnailUrl: number;
};

type PostBodyFile = {
  // id: string;
  // name: string;
  // extension: string;
  // size: number;
  url: string;
};

type PostBodyUrlEmbed = {
  // id: string;
  type: "html";
  // html: string;
} | {
  // id: string;
  type: "htmlcard";
  // html: string;
} | {
  // id: string;
  type: "fanbox.post";
  // postInfo: {
  //   id: string;
  //   title: string;
  //   feeRequired: string;
  //   hasAdultContent: boolean;
  //   creatorId: string;
  //   user: User;
  //   coverImageUrl: string;
  //   excerpt: string;
  //   publishedDatetime: string;
  // };
};

type PostBodyArticleBlock = {
  type: "p";
  text: string;
} | {
  type: "header";
  text: string;
} | {
  type: "image";
  imageId: string;
} | {
  type: "file";
  fileId: string;
} | {
  type: "url_embed";
  urlEmbedId: string;
};

type PostImage = {
  type: "image";
  body: {
    text: string;
    images?: PostBodyImage[];
  } | null;
};

type PostFile = {
  type: "file";
  body: {
    text: string;
    files?: PostBodyFile[];
  } | null;
};

type PostArticle = {
  type: "article";
  body: {
    blocks: PostBodyArticleBlock[];
    imageMap: Record<string, PostBodyImage>;
    fileMap: Record<string, PostBodyFile>;
    // embedMap: Record<string, ?>;
    urlEmbedMap: Record<string, PostBodyUrlEmbed>;
  } | null;
};
